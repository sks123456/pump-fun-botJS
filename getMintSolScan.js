const WebSocket = require('ws');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');

// WebSocket RPC URL and mint authority public key
const WS_URL = 'wss://api.mainnet-beta.solana.com'; // WebSocket RPC URL
const MINT_AUTHORITY_PUBKEY = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM'; // Replace with actual mint authority pubkey

// WebSocket connection setup
const ws = new WebSocket(WS_URL);

// Subscription message
const subscribeMessage = JSON.stringify({
    jsonrpc: '2.0',
    method: 'logsSubscribe',
    params: [
        { mentions: [MINT_AUTHORITY_PUBKEY] },  // Subscribe to logs that mention the mint authority
        { commitment: 'processed' }            // We want processed logs
    ],
    id: 1
});

// WebSocket message listener
ws.on('open', () => {
    console.log('WebSocket connected');
    ws.send(subscribeMessage);
    console.log(`Subscribed to logs for mint authority: ${MINT_AUTHORITY_PUBKEY}`);
});

// Handle incoming WebSocket messages (logs)
ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    if (message.method === 'logsNotification') {
        const logData = message.params.result;

        // Extract the signature and process the log
        const { value } = logData;
        const { signature, logs, err } = value;

        if (logs && logs.some(log => log.includes("Program log: Create")) && err == null) {
            console.log('Found logs for the mint authority!');
            console.log('Signature:', signature);

            // Scrape the mint address from the explorer using the transaction signature
            scrapeMintAddress(signature).then((mintAddress) => {
                if (mintAddress) {
                    console.log(`Mint Address: ${mintAddress}`);

                    // Save the data (transaction link, signature, mint address) to a file
                    const transactionUrl = `https://solscan.io/tx/${signature}`;
                    saveDataToFile(transactionUrl, signature, mintAddress);
                } else {
                    console.log('Could not retrieve mint address');
                }
            });
        }
    }
});

async function scrapeMintAddress(transactionSignature) {
    const transactionUrl = `https://solscan.io/tx/${transactionSignature}`;

    // Setup WebDriver (Chrome in headless mode)
    const options = new chrome.Options();
    options.addArguments('--headless'); // Run in headless mode
    const driver = new Builder().forBrowser('chrome').setChromeOptions(options).build();

    try {
        // Open the Solscan URL
        await driver.get(transactionUrl);

        // Wait for the page to load and ensure the token links are present
        await driver.wait(until.elementLocated(By.css('a[href*="/token/"]')), 20000); // Timeout increased to 20s for stability

        // Retrieve all anchor tags with /token/ in the href
        const tokenLinks = await driver.findElements(By.css('a[href*="/token/"]'));

        // Loop through token links to find the one that points to the mint address
        for (const link of tokenLinks) {
            const href = await link.getAttribute('href');

            // The mint address is the part of the URL after '/token/'
            const mintAddressMatch = href.match(/\/token\/([a-zA-Z0-9]+)/);
            if (mintAddressMatch) {
                const mintAddress = mintAddressMatch[1];

                // Ensure the mint address ends with 'pump'
                if (mintAddress.endsWith('pump')) {
                    return mintAddress; // Return the mint address if it ends with 'pump'
                }
            }
        }

        // If no valid mint address is found, return null
        console.error(`Mint address not found in transaction: ${transactionSignature}`);
        return null;

    } catch (err) {
        console.error(`Error scraping mint address for ${transactionSignature}:`, err);
    } finally {
        // Close the driver after scraping
        await driver.quit();
    }

    return null;
}


// Function to save data to a JSON file
function saveDataToFile(transactionUrl, signature, mintAddress) {
    const data = {
        transactionUrl: transactionUrl,
        signature: signature,
        mintAddress: mintAddress,
        timestamp: new Date().toISOString() // Add timestamp to record when the data was added
    };

    // Path to the data file (you can change the file name if needed)
    const filePath = './dataSOLSCAN.json';

    // Check if the file exists
    fs.readFile(filePath, 'utf8', (err, content) => {
        let existingData = [];

        if (!err && content) {
            // Parse the existing data if file already contains data
            existingData = JSON.parse(content);
        }

        // Append the new data to the existing data array
        existingData.push(data);

        // Write the updated data back to the file
        fs.writeFile(filePath, JSON.stringify(existingData, null, 2), (err) => {
            if (err) {
                console.error('Error saving data to file:', err);
            } else {
                console.log('Data saved successfully!');
            }
        });
    });
}

// WebSocket error handler
ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

// WebSocket close handler
ws.on('close', () => {
    console.log('WebSocket connection closed');
});
