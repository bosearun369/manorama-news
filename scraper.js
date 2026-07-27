const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function fetchNews() {
    const categories = [
        { name: 'general', query: 'site:manoramaonline.com' },
        { name: 'kerala', query: 'site:manoramaonline.com കേരളം' },
        { name: 'sports', query: 'site:manoramaonline.com സ്പോർട്സ്' },
        { name: 'movies', query: 'site:manoramaonline.com സിനിമ' }
    ];

    let allArticles = [];
    let seenTitles = new Set();

    console.log("Launching invisible Chrome browser...");
    // These arguments prevent the browser from crashing on GitHub's servers
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    for (let cat of categories) {
        console.log(`\nFetching category: ${cat.name}...`);
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cat.query)}&hl=ml&gl=IN&ceid=IN:ml`;
        
        // Grab the initial RSS list (this part is fast)
        const response = await fetch(feedUrl);
        const xmlText = await response.text();
        if (!xmlText) continue;

        const items = xmlText.split('<item>');
        let categoryCount = 0;

        // Loop through the articles (max 5 per category to save time/memory)
        for (let i = 1; i < items.length && categoryCount < 5; i++) {
            const itemStr = items[i];
            const titleMatch = itemStr.match(/<title>(.*?)<\/title>/);
            const linkMatch = itemStr.match(/<link>(.*?)<\/link>/) || itemStr.match(/href="(.*?)"/);
            
            if (titleMatch && linkMatch) {
                let rawTitle = titleMatch[1].replace('<![CDATA[', '').replace(']]>', '');
                let cleanTitle = rawTitle.split(' - ')[0].split(' | ')[0].trim();
                let link = linkMatch[1];
                let snippet = cleanTitle.substring(0, 20);

                if (!seenTitles.has(snippet) && cleanTitle.length > 5) {
                    seenTitles.add(snippet);
                    console.log(`Scraping: ${cleanTitle.substring(0, 40)}...`);
                    
                    let fullText = "<p>പൂർണ്ണരൂപം വായിക്കാൻ താഴെയുള്ള ലിങ്കിൽ ക്ലിക്ക് ചെയ്യുക.</p>";
                    let finalUrl = link;

                    try {
                        const page = await browser.newPage();
                        
                        // Speed hack: Block images, fonts, and stylesheets from loading
                        await page.setRequestInterception(true);
                        page.on('request', (req) => {
                            if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
                                req.abort();
                            } else {
                                req.continue();
                            }
                        });

                        // Open the link and wait for the HTML to load (max 30 seconds)
                        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        finalUrl = page.url(); 
                        
                        // Wait 2 extra seconds for Manorama's Javascript to render the text
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Read the text exactly as it appears on the screen!
                        const paragraphs = await page.evaluate(() => {
                            const pElements = Array.from(document.querySelectorAll('p'));
                            return pElements
                                .map(p => p.innerText.trim())
                                .filter(p => p.length > 60 && !p.includes('Read More') && !p.includes('Also Read'));
                        });

                        if (paragraphs && paragraphs.length > 0) {
                            fullText = paragraphs.map(p => `<p>${p}</p>`).join('');
                        }
                        
                        await page.close();
                    } catch (e) {
                        console.log(`  -> Failed to extract text: ${e.message}`);
                    }

                    allArticles.push({
                        title: cleanTitle,
                        link: finalUrl,
                        category: cat.name,
                        fullTextHTML: fullText
                    });
                    
                    categoryCount++;
                }
            }
        }
    }

    await browser.close();
    fs.writeFileSync('news.json', JSON.stringify(allArticles, null, 2));
    console.log(`\nSuccess! Saved ${allArticles.length} articles to news.json`);
}

fetchNews();
