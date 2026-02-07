const puppeteer = require('puppeteer');

const COOKIE = '_ga=GA1.1.853541513.1737922934; 91username=bb5dIXl5FKDYmdptTaKfirnVaq3GCSiiGdrJSOAqopco; DUID=dcd3JLwwkSLR7IYKeTJLVXUm76vr0BWNLyiJskpZ3EFVVaiv; SUID=5fabmDly4CsjkUXJKxkMYm5ZDFIbWDCNZ6%2FIeR6wEZnKQH%2Fc; USERNAME=694fIM8YGiFM6iM%2FYUTbMNJvi8zmsOFF4anzG0K6KrVf%2Fy8; EMAILVERIFIED=yes; school=931fKC%2F6IapCwr4n9A4ruXDlNxRNkOZDFi6QCCA; level=1edfF4oXf82GztiE0ZRLLHL1tn6GO6%2FaLNOqFgjb; language=cn_CN; _ga_K5S02BRGF0=deleted; _ga_K5S02BRGF0=GS1.1.1743909941.30.1.1743909944.0.0.0; CLIPSHARE=htgjnd25ct6rbr80abc15oqks6; cf_clearance=xVp1l4KLaro.b_f.e_Mr3Oh0xURrLQFtvLF9IpN9LM0-1743929609-1.2.1.1-ljSjj.WeO4lDzErbkmhlPxnuNqa27o_5.ZNY_bIABQ3h16v4ARq4kLQrQIbj7NJMWb5Jw67nx5UG4IZBsBwDD5ux4aX0FNwR54bwMgzlR_CQDXNGcBBjtY6zqs3I9.h356Q5o4g1WsbKKVNoyW_rSX9pyK9K0.mGFzkrVkQsQ8Jatl5F4pjqen0WbgrbCteDiMrY5JyAos6XBVTF8LcUmGtBvhdclqm_Q..mK.YofS_bYuxUhW74XAR6.YnbL0BvtajcBXig5Y4iO9rbMq2Nb5l..6giQhx9awUD9.TTD8xEjiEwArNp4wLGHyeQYMkwD57HJlyXHfsz6TxBF0wIUGh4mpEsQyEC6i73rzGqt94';

/**
 * 获取视频列表
 * @param {string} listUrl - 视频列表页面URL
 * @returns {Promise<Array>} - 视频信息数组
 */
async function getVideoPage(listUrl) {
    if (!listUrl) {
        throw new Error('请提供视频列表页面URL');
    }

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const cookies = COOKIE.split(';').map(cookie => {
            const [name, value] = cookie.trim().split('=');
            return {
                name,
                value,
                domain: 'w1004.9p58b.com',
                path: '/'
            };
        });
        await page.setCookie(...cookies);

        await page.goto(listUrl, {
            waitUntil: 'networkidle0',
            timeout: 120000
        });

        // 等待列表加载
        await page.waitForSelector('.well-sm', { timeout: 120000 });

        // 获取所有视频信息
        const videoList = await page.evaluate(() => {
            const videoItems = document.querySelectorAll('.well.well-sm');
            const videoList = [];
            
            videoItems.forEach(item => {
                const link = item.querySelector('a');
                const img = item.querySelector('.img-responsive');
                const title = link.querySelector('.video-title').textContent.trim();
                const url = link.href;
                const time = item.querySelector('.duration').textContent.trim();
                
                // 获取热度
                const viewsMatch = item.textContent.match(/热度:\s*(\d+)/);
                const views = viewsMatch ? viewsMatch[1] : '0';
                
                // 获取收藏
                const favoritesMatch = item.textContent.match(/收藏:\s*(\d+)/);
                const favorites = favoritesMatch ? favoritesMatch[1] : '0';
                
                // 获取添加时间
                const addTimeMatch = item.textContent.match(/添加时间:\s*([^\n]+)/);
                const addTime = addTimeMatch ? addTimeMatch[1].trim() : '未知';
                
                // 获取封面图
                const coverImage = img ? img.src : '';
                
                videoList.push({
                    title,
                    url,
                    time,
                    views,
                    favorites,
                    addTime,
                    coverImage
                });
            });

            return videoList;
        });

        return videoList;

    } catch (error) {
        throw new Error('获取视频列表失败: ' + error.message);
    } finally {
        setTimeout(async () => {
            await browser.close();
        }, 10000);
    }
}

// 如果直接运行此文件，则使用命令行参数作为列表URL
if (require.main === module) {
    const listUrl = process.argv[2];
    if (!listUrl) {
        console.error('请提供视频列表页面URL');
        process.exit(1);
    }

    getVideoPage(listUrl)
        .then(videos => {
            if (videos.length > 0) {
                videos.forEach(video => {
                    console.log(`标题: ${video.title}`);
                    console.log(`链接: ${video.url}`);
                    console.log(`时长: ${video.time}`);
                    console.log(`添加时间: ${video.addTime}`);
                    console.log(`热度: ${video.views}`);
                    console.log(`收藏: ${video.favorites}`);
                    console.log(`封面图: ${video.coverImage}`);
                    console.log('---');
                });
            } else {
                console.error('未找到视频');
            }
        })
        .catch(error => {
            console.error(error.message);
        });
}

module.exports = getVideoPage; 