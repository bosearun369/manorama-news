const fs = require('fs');

async function fetchNews() {
    const categories = [
        { name: 'general', query: 'site:manoramaonline.com' },
        { name: 'kerala', query: 'site:manoramaonline.com കേരളം' },
        { name: 'sports', query: 'site:manoramaonline.com സ്പോർട്സ്' },
        { name: 'movies', query: 'site:manoramaonline.com സിനിമ' }
    ];

    let allArticles = [];
    let seenTitles = new Set();
    
    // We use a fake browser ID so Google and Manorama don't immediately block us as a bot
    const fakeBrowser = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

    for (let cat of categories) {
        try {
            console.log(`Fetching category: ${cat.name}...`);
            const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cat.query)}&hl=ml&gl=IN&ceid=IN:ml`;
            
            const response = await fetch(feedUrl, { headers: fakeBrowser });
            const xmlText = await response.text();
            if (!xmlText) continue;

            const items = xmlText.split('<item>');
            for (let i = 1; i < items.length; i++) {
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

                        let fullText = "<p>പൂർണ്ണരൂപം വായിക്കാൻ താഴെയുള്ള ലിങ്കിൽ ക്ലിക്ക് ചെയ്യുക.</p>";
                        try {
                            // Step 1: Follow Google's link as a "browser"
                            const googleRes = await fetch(link, { headers: fakeBrowser });
                            let realManoramaUrl = googleRes.url; 
                            
                            // If Google trapped us in a redirect page, rip the real URL out of the HTML
                            if (realManoramaUrl.includes('news.google.com')) {
                                const googleHtml = await googleRes.text();
                                const realUrlMatch = googleHtml.match(/(https?:\/\/[^"']*manoramaonline\.com[^"']*)/i);
                                if (realUrlMatch) {
                                    // Fix encoded characters like &amp; -> &
                                    realManoramaUrl = realUrlMatch[1].replace(/&amp;/g, '&'); 
                                }
                            }

                            // Step 2: Use the Proxy to bypass Manorama's bot blocker
                            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(realManoramaUrl)}`;
                            const articleRes = await fetch(proxyUrl);
                            
                            // Make sure the proxy actually responded properly
                            if (articleRes.ok) {
                                const articleJson = await articleRes.json();
                                const articleHtml = articleJson.contents; 
                                
                                if (articleHtml) {
                                    const pMatches = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/g);
                                    if (pMatches) {
                                        const cleanParagraphs = pMatches
                                            .map(p => p.replace(/<[^>]+>/g, '').trim())
                                            .filter(p => p.length > 60 && !p.includes('Read More') && !p.includes('Also Read'));
                                            
                                        if (cleanParagraphs.length > 0) {
                                            fullText = cleanParagraphs.map(p => `<p>${p}</p>`).join('');
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.log("Could not scrape full article body for:", cleanTitle);
                        }

                        allArticles.push({
                            title: cleanTitle,
                            link: realManoramaUrl || link, // Save the clean link for your frontend button
                            category: cat.name,
                            fullTextHTML: fullText
                        });
                    }
                }
            }
        } catch (e) {
            console.log("Error fetching category:", cat.name, e);
        }
    }

    fs.writeFileSync('news.json', JSON.stringify(allArticles, null, 2));
    console.log(`Saved ${allArticles.length} articles to news.json`);
}

fetchNews();
