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

    for (let cat of categories) {
        try {
            console.log(`Fetching category: ${cat.name}...`);
            const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cat.query)}&hl=ml&gl=IN&ceid=IN:ml`;
            
            // Fetch directly from Google News — no proxy needed!
            const response = await fetch(feedUrl);
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
                            // Fetch the full article directly
                            const articleRes = await fetch(link);
                            const articleHtml = await articleRes.text();
                            
                            if (articleHtml) {
                                const pMatches = articleHtml.match(/<p[^>]*>(.*?)<\/p>/g);
                                if (pMatches) {
                                    const cleanParagraphs = pMatches
                                        .map(p => p.replace(/<[^>]+>/g, '').trim())
                                        .filter(p => p.length > 40);
                                    if (cleanParagraphs.length > 0) {
                                        fullText = cleanParagraphs.map(p => `<p>${p}</p>`).join('');
                                    }
                                }
                            }
                        } catch (e) {
                            console.log("Could not scrape full article body for:", cleanTitle);
                        }

                        allArticles.push({
                            title: cleanTitle,
                            link: link,
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
