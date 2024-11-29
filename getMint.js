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
                    const transactionUrl = `https://explorer.solana.com/tx/${signature}?cluster=mainnet`;
                    saveDataToFile(transactionUrl, signature, mintAddress);
                } else {
                    console.log('Could not retrieve mint address');
                }
            });
        }
    }
});

// Function to scrape Solana Explorer for mint address
async function scrapeMintAddress(transactionSignature) {
    const transactionUrl = `https://explorer.solana.com/tx/${transactionSignature}?cluster=mainnet`;

    // Setup WebDriver (Chrome in headless mode)
    const options = new chrome.Options();
    options.addArguments('--headless'); // Run in headless mode
    const driver = new Builder().forBrowser('chrome').setChromeOptions(options).build();

    try {
        // Open the Solana Explorer URL
        await driver.get(transactionUrl);

        // Wait for the page to load and the required element to be available (increased timeout)
        await driver.wait(until.elementLocated(By.css('pre.json-wrap')), 20000); // 20-second timeout

        // Retrieve the JSON data from the page
        const instructionDataSection = await driver.findElement(By.css('pre.json-wrap'));
        const instructionData = await instructionDataSection.getText();

        // Parse the JSON data to extract the mint address
        try {
            const instructionJson = JSON.parse(instructionData);
            if (instructionJson.info && instructionJson.info.mint) {
                const mintAddress = instructionJson.info.mint;
                return mintAddress;
            }
        } catch (err) {
            console.error(`Error parsing JSON for transaction ${transactionSignature}:`, err);
        }
    } catch (err) {
        console.error(`Error scraping mint address for ${transactionSignature} at URL: ${transactionUrl}:`, err);
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
    const filePath = './data.json';

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
