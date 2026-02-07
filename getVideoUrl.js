const puppeteer = require('puppeteer');

const COOKIE = '_ga=GA1.1.853541513.1737922934; 91username=bb5dIXl5FKDYmdptTaKfirnVaq3GCSiiGdrJSOAqopco; DUID=dcd3JLwwkSLR7IYKeTJLVXUm76vr0BWNLyiJskpZ3EFVVaiv; SUID=5fabmDly4CsjkUXJKxkMYm5ZDFIbWDCNZ6%2FIeR6wEZnKQH%2Fc; USERNAME=694fIM8YGiFM6iM%2FYUTbMNJvi8zmsOFF4anzG0K6KrVf%2Fy8; EMAILVERIFIED=yes; school=931fKC%2F6IapCwr4n9A4ruXDlNxRNkOZDFi6QCCA; level=1edfF4oXf82GztiE0ZRLLHL1tn6GO6%2FaLNOqFgjb; language=cn_CN; _ga_K5S02BRGF0=deleted; _ga_K5S02BRGF0=GS1.1.1743909941.30.1.1743909944.0.0.0; CLIPSHARE=htgjnd25ct6rbr80abc15oqks6; cf_clearance=xVp1l4KLaro.b_f.e_Mr3Oh0xURrLQFtvLF9IpN9LM0-1743929609-1.2.1.1-ljSjj.WeO4lDzErbkmhlPxnuNqa27o_5.ZNY_bIABQ3h16v4ARq4kLQrQIbj7NJMWb5Jw67nx5UG4IZBsBwDD5ux4aX0FNwR54bwMgzlR_CQDXNGcBBjtY6zqs3I9.h356Q5o4g1WsbKKVNoyW_rSX9pyK9K0.mGFzkrVkQsQ8Jatl5F4pjqen0WbgrbCteDiMrY5JyAos6XBVTF8LcUmGtBvhdclqm_Q..mK.YofS_bYuxUhW74XAR6.YnbL0BvtajcBXig5Y4iO9rbMq2Nb5l..6giQhx9awUD9.TTD8xEjiEwArNp4wLGHyeQYMkwD57HJlyXHfsz6TxBF0wIUGh4mpEsQyEC6i73rzGqt94';

/**
 * 等待指定时间
 * @param {number} ms - 等待的毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取视频地址
 * @param {string} targetUrl - 视频页面URL
 * @returns {Promise<string|null>} - 视频地址或null
 */
async function getVideoUrl(targetUrl) {
    if (!targetUrl) {
        throw new Error('请提供视频页面URL');
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

        await page.goto(targetUrl, {
            waitUntil: 'networkidle0',
            timeout: 120000
        });

        await page.waitForSelector('video source', { timeout: 120000 });

        let retryCount = 0;
        const maxRetries = 3;
        let videoSource = null;

        while (retryCount < maxRetries) {
            videoSource = await page.evaluate(() => {
                const video = document.querySelector('video source');
                return video ? video.src : null;
            });

            if (videoSource) {
                break;
            }

            console.log(`第 ${retryCount + 1} 次尝试未找到视频源，等待3秒后重试...`);
            await sleep(3000);
            retryCount++;
        }

        if (!videoSource) {
            throw new Error('重试3次后仍未找到视频源地址');
        }

        return videoSource;

    } catch (error) {
        throw new Error('获取视频地址失败: ' + error.message);
    } finally {
        setTimeout(async () => {
            await browser.close();
        }, 10000);
    }
}

// 如果直接运行此文件，则使用命令行参数作为视频URL
if (require.main === module) {
    const targetUrl = process.argv[2];
    if (!targetUrl) {
        console.error('请提供视频页面URL');
        process.exit(1);
    }

    getVideoUrl(targetUrl)
        .then(url => {
            if (url) {
                console.log(url);
            } else {
                console.error('未找到视频地址');
            }
        })
        .catch(error => {
            console.error(error.message);
        });
}

module.exports = getVideoUrl; 