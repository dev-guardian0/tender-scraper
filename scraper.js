const { chromium } = require('playwright');
const fs = require('fs').promises;
const XLSX = require('xlsx');

class TenderScraper {
    constructor() {
        this.baseUrl = 'https://alertalicitacao.com.br';
        this.browser = null;
        this.context = null;
        this.page = null;
    }

    async init() {
        this.browser = await chromium.launch({
            headless: false // Set to false to see the browser in action
        });
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
    }

    async close() {
        await this.context?.close();
        await this.browser?.close();
    }

    async searchTenders(keyword) {
        try {
            console.log(`Searching for: ${keyword}`);

            // Navigate to the main page
            await this.page.goto(this.baseUrl);

            // Find the search input using role
            const searchInput = await this.page.getByRole('textbox', { name: 'Procurar...' });
            await searchInput.fill(keyword);

            // Find and click the search button using role
            const searchButton = await this.page.getByRole('button', { name: '' }); // Empty name because it's an icon button
            await searchButton.click();

            // Extract the results
            const results = await this.extractResults();

            // Save results to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `results/tender_results_${timestamp}.json`;
            await this.saveResults(results, filename);

            return results;

        } catch (error) {
            console.error('Error during search:', error);
            // Save the page content for debugging
            await this.page.content().then(content => 
                fs.writeFile('error_page.html', content, 'utf8')
            ).catch(console.error);
            return [];
        }
    }

    async extractResults() {
        const panels = await this.page.locator('div.panel').all();
        const results = [];
    
        for (const panel of panels) {
            try {
                const titleLink = await panel.getByRole('link').first();
                const title = await titleLink.textContent();
                const onlyLink = await titleLink.getAttribute('href');
                const link = this.baseUrl + onlyLink;

                let organization;
                const hasOrgao = await panel.getByText('Orgão:', { exact: false }).count() > 0;

                if (hasOrgao) {
                    const orgElement = await panel.getByText('Orgão:', { exact: false }).first();
                    const orgElementText = await orgElement.locator('..').textContent();
                    organization = orgElementText.replace('Orgão:', '').trim();
                }
                else {
                    let allContent = await panel.locator('font').all();
                    allContent = allContent.length > 0 ? allContent : await panel.locator('p').all();

                    for (const p of allContent) {
                        const text = await p.textContent();
                        if (text === text.toUpperCase() && text.match(/[A-Z]/) && !text.includes(':')) {
                            organization = text.trim();
                            break;
                        }
                    }
                }

                const dateElement = await panel.getByText(/Abertura|Data de abertura/, { exact: false });
                const openingDate = await dateElement.locator('..').textContent()
                    .then(text => text.replace(/Abertura:|Data de abertura:/g, '').trim());

                const valueElement = await panel.getByText('Valor:', { exact: false }).first();
                const estimatedValue = await valueElement.locator('..').textContent()
                    .then(text => text.replace('Valor:', '').trim());

                results.push({
                    title,
                    link,
                    organization,
                    openingDate,
                    estimatedValue
                });

            } catch (error) {
                console.error('Error parsing panel:', error);
                continue;
            }
        }
        return results;
    }

    async saveResults(results, filename) {
        await fs.writeFile(
            filename,
            JSON.stringify(results, null, 2),
            'utf8'
        );
        console.log(`Results saved to ${filename}`);
    }

    async saveToExcel(results, filename) {
        try {
            // Create a new workbook
            const workbook = XLSX.utils.book_new();
            
            // Convert results to worksheet
            const worksheet = XLSX.utils.json_to_sheet(results);
            
            // Add the worksheet to the workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Tenders');
            
            // Save the workbook
            XLSX.writeFile(workbook, filename);
            
            console.log(`Results saved to ${filename}`);
        } catch (error) {
            console.error('Error saving to Excel:', error);
        }
    }
}

async function main() {
    const scraper = new TenderScraper();
    
    try {
        await scraper.init();
        
        const searchKeyword = 'catarata';
        const results = await scraper.searchTenders(searchKeyword);
        
        if (results.length > 0) {
            // Save to Excel with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const excelFilename = `results/tender_results_${timestamp}.xlsx`;
            await scraper.saveToExcel(results, excelFilename);
            
            console.log(`\n${results.length} results found and saved to Excel`);
        } else {
            console.log('No results found');
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await scraper.close();
    }
}

// Run the scraper
main().catch(console.error);