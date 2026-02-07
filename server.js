const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const getVideoPage = require('./getVideoPage');
const getVideoUrl = require('./getVideoUrl');

const app = express();
const port = 3000;

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 存储爬虫状态和结果
let crawlerState = {
    isRunning: false,
    isPaused: false,
    progress: 0,
    totalPages: 0,
    completedPages: 0,
    videoPages: [],
    videoUrls: [],
    error: null,
    currentPage: 0,
    endPage: 0,
    currentPageProgress: 0, // 当前页面的视频爬取进度
    totalVideosInCurrentPage: 0, // 当前页面的总视频数
    completedVideosInCurrentPage: 0
};

// 默认配置
let config = {
    concurrency: 3,
    timeout: 120000,
    startUrl: 'https://w1004.9p58b.com/v.php?category=hot&viewtype=basic&page=2'
};

// 保存配置
app.post('/api/config', (req, res) => {
    config = { ...config, ...req.body };
    res.json({ success: true });
});

// 获取配置
app.get('/api/config', (req, res) => {
    res.json(config);
});

// 获取爬虫状态
app.get('/api/status', (req, res) => {
    res.json({
        isRunning: crawlerState.isRunning,
        isPaused: crawlerState.isPaused,
        progress: crawlerState.progress,
        totalPages: crawlerState.totalPages,
        completedPages: crawlerState.completedPages,
        currentPage: crawlerState.currentPage,
        endPage: crawlerState.endPage,
        videoUrls: crawlerState.videoUrls,
        error: crawlerState.error
    });
});

// 暂停/继续爬虫
app.post('/api/pause', (req, res) => {
    const { pause } = req.body;
    crawlerState.isPaused = pause;
    res.json({ success: true });
});

// 关闭服务
app.post('/api/shutdown', (req, res) => {
    crawlerState.isRunning = false;
    crawlerState.isPaused = false;
    res.json({ success: true });
});

// 开始爬虫
app.post('/api/start', async (req, res) => {
    if (crawlerState.isRunning) {
        return res.status(400).json({ error: '爬虫已经在运行中' });
    }

    const { startUrl, startPage, endPage } = req.body;
    if (!startUrl || !startPage || !endPage) {
        return res.status(400).json({ error: '缺少必要的参数' });
    }

    crawlerState = {
        isRunning: true,
        isPaused: false,
        progress: 0,
        totalPages: 0,
        completedPages: 0,
        videoPages: [],
        videoUrls: [],
        error: null,
        currentPage: startPage,
        endPage: endPage,
        currentPageProgress: 0,
        totalVideosInCurrentPage: 0,
        completedVideosInCurrentPage: 0
    };

    res.json({ success: true });

    try {
        // 获取今天的日期作为文件名
        const today = new Date().toISOString().split('T')[0];
        const filename = `data/videos_${today}.json`;
        
        // 确保data目录存在
        await fs.ensureDir('data');
        
        // 读取现有数据
        let existingData = {
            timestamp: new Date().toISOString(),
            config: config,
            videos: []
        };
        
        try {
            const fileContent = await fs.readFile(filename, 'utf8');
            if (fileContent) {
                existingData = JSON.parse(fileContent);
            }
        } catch (error) {
            // 如果文件不存在，使用默认数据
        }
        
        // 创建标题到视频的映射，用于去重
        const titleMap = new Map();
        existingData.videos.forEach(video => {
            if (video.title) {
                titleMap.set(video.title, {
                    ...video,
                    coverImage: video.coverImage || ''
                });
            }
        });

        // 获取所有页面的视频列表
        for (let page = startPage; page <= endPage; page++) {
            if (!crawlerState.isRunning) break;
            
            // 检查是否暂停
            while (crawlerState.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!crawlerState.isRunning) break;
            }

            const pageUrl = `${startUrl}${startUrl.includes('?') ? '&' : '?'}page=${page}`;
            const videoList = await getVideoPage(pageUrl);
            
            crawlerState.videoPages = [...crawlerState.videoPages, ...videoList];
            crawlerState.totalPages = endPage - startPage + 1;
            crawlerState.currentPage = page;
            crawlerState.totalVideosInCurrentPage = videoList.length;
            crawlerState.completedVideosInCurrentPage = 0;
            crawlerState.currentPageProgress = 0;

            // 并发处理视频页面
            const processVideo = async (video, index) => {
                try {
                    const videoUrl = await getVideoUrl(video.url);
                    if (videoUrl) {
                        const processedVideo = {
                            ...video,
                            videoUrl
                        };
                        crawlerState.videoUrls.push(processedVideo);
                        
                        // 添加到标题映射中（自动去重）
                        if (video.title && !titleMap.has(video.title)) {
                            titleMap.set(video.title, {
                                ...processedVideo,
                                coverImage: video.coverImage || ''
                            });
                        }
                    }
                } catch (error) {
                    console.error(`获取视频地址失败: ${video.url}`, error);
                } finally {
                    // 更新当前页面的视频爬取进度
                    crawlerState.completedVideosInCurrentPage++;
                    crawlerState.currentPageProgress = (crawlerState.completedVideosInCurrentPage / crawlerState.totalVideosInCurrentPage) * 100;
                    
                    // 计算总进度
                    // 1. 计算页码基础进度（每页占20%）
                    const pageBaseProgress = ((page - startPage) / crawlerState.totalPages) * 100;
                    // 2. 计算当前页的视频进度（每页的视频进度占该页的100%）
                    const currentPageVideoProgress = (crawlerState.currentPageProgress / 100) * (100 / crawlerState.totalPages);
                    // 3. 总进度 = 页码基础进度 + 当前页视频进度
                    crawlerState.progress = pageBaseProgress + currentPageVideoProgress;
                }
            };

            // 使用配置中的并发数，如果没有设置则默认为1
            const concurrency = config.concurrency || 1;
            console.log(`使用并发数: ${concurrency}`);
            
            for (let i = 0; i < videoList.length; i += concurrency) {
                if (!crawlerState.isRunning) break;
                
                // 检查是否暂停
                while (crawlerState.isPaused) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (!crawlerState.isRunning) break;
                }
                
                const batch = videoList.slice(i, i + concurrency);
                await Promise.all(batch.map((video, index) => processVideo(video, i + index)));
                
                // 每批处理完成后等待1秒，避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 每页爬取完成后，更新并保存数据
            const allVideos = Array.from(titleMap.values());
            const limitedVideos = allVideos.slice(0, 1000);
            
            existingData.videos = limitedVideos;
            existingData.timestamp = new Date().toISOString();
            existingData.total = limitedVideos.length;
            
            // 保存到文件
            await fs.writeFile(filename, JSON.stringify(existingData, null, 2));
            
            console.log(`第 ${page} 页爬取完成，当前共 ${limitedVideos.length} 个视频`);
        }

    } catch (error) {
        crawlerState.error = error.message;
    } finally {
        crawlerState.isRunning = false;
        crawlerState.isPaused = false;
    }
});

// 关闭爬虫
app.post('/api/stop', (req, res) => {
    if (!crawlerState.isRunning) {
        return res.status(400).json({ error: '爬虫未在运行中' });
    }

    // 停止爬虫
    crawlerState.isRunning = false;
    crawlerState.isPaused = false;
    
    // 清空进度
    crawlerState.progress = 0;
    crawlerState.currentPageProgress = 0;
    crawlerState.completedVideosInCurrentPage = 0;
    
    res.json({
        isRunning: false,
        isPaused: false,
        progress: 0,
        currentPage: crawlerState.currentPage,
        endPage: crawlerState.endPage,
        currentPageProgress: 0,
        totalVideosInCurrentPage: crawlerState.totalVideosInCurrentPage,
        videoUrls: crawlerState.videoUrls
    });
});

// 保存结果
app.post('/api/save', async (req, res) => {
    try {
        // 获取今天的日期作为文件名
        const today = new Date().toISOString().split('T')[0];
        const filename = `data/videos_${today}.json`;
        
        // 确保data目录存在
        await fs.ensureDir('data');
        
        // 读取现有数据
        let existingData = {
            timestamp: new Date().toISOString(),
            config: config,
            videos: []
        };
        
        try {
            const fileContent = await fs.readFile(filename, 'utf8');
            if (fileContent) {
                existingData = JSON.parse(fileContent);
            }
        } catch (error) {
            // 如果文件不存在，使用默认数据
        }
        
        // 创建标题到视频的映射，用于去重
        const titleMap = new Map();
        existingData.videos.forEach(video => {
            if (video.title) {
                titleMap.set(video.title, {
                    ...video,
                    coverImage: video.coverImage || '' // 确保有coverImage字段
                });
            }
        });
        
        // 添加新视频，去重
        const videoUrls = req.body.videoUrls || crawlerState.videoUrls;
        videoUrls.forEach(video => {
            if (video.title && !titleMap.has(video.title)) {
                titleMap.set(video.title, {
                    ...video,
                    coverImage: video.coverImage || '' // 确保有coverImage字段
                });
            }
        });
        
        // 转换为数组并限制条数
        const allVideos = Array.from(titleMap.values());
        const limitedVideos = allVideos.slice(0, 1000);
        
        // 更新数据
        existingData.videos = limitedVideos;
        existingData.timestamp = new Date().toISOString();
        existingData.total = limitedVideos.length;
        
        // 保存到文件
        await fs.writeFile(filename, JSON.stringify(existingData, null, 2));
        
        res.json({ 
            success: true, 
            filename,
            total: limitedVideos.length,
            added: videoUrls.length,
            duplicates: allVideos.length - limitedVideos.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取数据文件列表
app.get('/api/data/list', async (req, res) => {
    try {
        // 确保data目录存在
        await fs.ensureDir('data');
        
        // 读取data目录下的所有JSON文件
        const files = await fs.readdir('data');
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        // 读取每个文件的基本信息
        const fileList = await Promise.all(jsonFiles.map(async (filename) => {
            try {
                const content = await fs.readFile(path.join('data', filename), 'utf8');
                const data = JSON.parse(content);
                return {
                    filename,
                    timestamp: data.timestamp,
                    total: data.total || 0
                };
            } catch (error) {
                console.error(`读取文件失败: ${filename}`, error);
                return null;
            }
        }));
        
        // 过滤掉读取失败的文件并按时间倒序排序
        const validFiles = fileList.filter(file => file !== null)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json(validFiles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除数据文件
app.delete('/api/data/delete', async (req, res) => {
    try {
        const { filename } = req.query;
        if (!filename) {
            return res.status(400).json({ error: '文件名不能为空' });
        }
        
        // 确保文件在data目录下
        const filePath = path.join('data', filename);
        if (!filePath.startsWith(path.join(process.cwd(), 'data'))) {
            return res.status(400).json({ error: '无效的文件路径' });
        }
        
        // 删除文件
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取数据文件详情
app.get('/api/data/detail', async (req, res) => {
    try {
        const { filename } = req.query;
        if (!filename) {
            return res.status(400).json({ error: '文件名不能为空' });
        }
        
        // 确保文件在data目录下
        const filePath = path.join('data', filename);
        
        // 检查文件是否存在
        if (!await fs.pathExists(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 读取文件内容
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        res.json(data);
    } catch (error) {
        console.error('获取文件详情失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 创建数据目录
fs.ensureDirSync('data');

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 