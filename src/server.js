const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const axios = require('axios');
const { exec } = require('child_process');
const sharp = require('sharp'); 
const dotenv = require('dotenv');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
dotenv.config();


const DIR_NAME = path.join(__dirname.replace("\\src",""))

const app = express();
app.use(cors());
app.use(express.json());


const PROJECT_ROOT = path.join(DIR_NAME , '..'); 
const VENV_PATH = path.join(PROJECT_ROOT, 'venv', 'Scripts', 'activate.bat');
const API_KEY = process.env.GEMINI_API_KEY || 'SUA_CHAVE_AQUI_SE_NAO_USAR_ENV';
const ARQUIVOS_ROOT = path.join(DIR_NAME, 'arquivos');
const PORT = 3000;
const MAX_IMAGE_HEIGHT = 4000;

app.use(express.static(DIR_NAME)); 
app.use('/arquivos', express.static(ARQUIVOS_ROOT));


let globalBrowser = null;


function log(type, message, progress = null) {
    
    const timestamp = new Date().toLocaleTimeString();
    let color = '\x1b[37m'; 

    const actions = {
        'INFO': '\x1b[36m',
        'SUCCESS':  '\x1b[32m',
        'ERROR':   '\x1b[31m',
        'WARN':   '\x1b[33m',
    };

    if (actions[type]) {
        color = actions[type];
    }

    console.log(`[${timestamp}] ${color}[${type}]\x1b[0m ${message}`);
}

async function getBrowser() {
    if (!globalBrowser || !globalBrowser.isConnected()) {
        console.log('[SYSTEM] Iniciando nova instância do navegador...');
        globalBrowser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
    }
    return globalBrowser;
}


app.get('/library', async (req, res) => {
    
    try {
        log('INFO', `A Rota /library foi chamada`);
        const library = [];
        if (!fsSync.existsSync(ARQUIVOS_ROOT)) return res.json([]);
        const domains = await fs.readdir(ARQUIVOS_ROOT);
        for (const domain of domains) {
            const domainPath = path.join(ARQUIVOS_ROOT, domain);
            if ((await fs.stat(domainPath)).isDirectory()) {
                const mangas = await fs.readdir(domainPath);
                for (const manga of mangas) {
                    const mangaPath = path.join(domainPath, manga);
                    if ((await fs.stat(mangaPath)).isDirectory()) {
                        const chapters = await fs.readdir(mangaPath);
                        const chaptersData = [];
                        for (const chap of chapters) {
                            const chapPath = path.join(mangaPath, chap);
                            if ((await fs.stat(chapPath)).isDirectory()) {
                                const transPath = path.join(chapPath, 'traduzido');
                                let hasFiles = false;
                                if(fsSync.existsSync(transPath)) {
                                    const files = await fs.readdir(transPath);
                                    hasFiles = files.length > 0;
                                }
                                chaptersData.push({ name: chap, hasTranslation: hasFiles });
                            }
                        }
                        if (chaptersData.length > 0) {
                            library.push({ domain: domain, name: manga, chapters: chaptersData });
                        }
                    }
                }
            }
        }
       
        res.json(library);
    } catch (error) { res.json([]); }
});


app.post('/get-images', async (req, res) => {
    
    const { domain, siteName, chapterName, type } = req.body; 
    const folderType = type === 'translated' ? 'traduzido' : 'original';
    const dirPath = path.join(ARQUIVOS_ROOT, domain, siteName, chapterName, folderType);
    try {
        if (!fsSync.existsSync(dirPath)) return res.json({ success: false, error: `Pasta não encontrada.` });
        const files = await fs.readdir(dirPath);
        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).sort((a, b) => {
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        res.json({ success: true, images });
    } catch (error) { res.json({ success: false, error: error.message }); }
});



app.get('/recommendations', async (req, res) => {
    
    if (!API_KEY || API_KEY === 'SUA_CHAVE_AQUI_SE_NAO_USAR_ENV') {
        return res.json({ success: false, error: 'Configure a GEMINI_API_KEY no arquivo .env ou no server.js' });
    }

    try {
        log('INFO', 'Analisando biblioteca para gerar recomendações...');
        
        const libraryItems = [];
        if (fsSync.existsSync(ARQUIVOS_ROOT)) {
            const domains = await fs.readdir(ARQUIVOS_ROOT);
            for (const domain of domains) {
                const domainPath = path.join(ARQUIVOS_ROOT, domain);
                if ((await fs.stat(domainPath)).isDirectory()) {
                    const mangas = await fs.readdir(domainPath);
                    
                    mangas.forEach(m => libraryItems.push(m.replace(/_/g, ' ')));
                }
            }
        }

        if (libraryItems.length === 0) {
            return res.json({ success: false, error: 'Sua biblioteca está vazia. Baixe algo primeiro para receber dicas!' });
        }

        
        const recentItems = libraryItems.slice(-10).join(', ');

        
        const prompt = `
            Eu sou um leitor que gosta das seguintes obras: ${recentItems}.
            Com base nisso, recomende 3 manhwas ou mangás similares que eu ainda não tenha lido.
            
            Regras de formatação:
            - Use **negrito** para o título da obra.
            - Dê uma sinopse super curta (máximo 1 frase) para cada um.
            - Use marcadores de lista (*).
            - Responda em Português do Brasil.
            - Seja casual e divertido.
        `;

        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
        
        const response = await axios.post(geminiUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        });

        
        const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (aiResponse) {
            log('SUCCESS', 'Recomendações geradas com sucesso.');
            res.json({ success: true, recommendation: aiResponse });
        } else {
            throw new Error('Resposta vazia da IA.');
        }

    } catch (error) {
        console.error(error); 
        const msg = error.response?.data?.error?.message || error.message;
        log('ERROR', `Falha ao gerar recomendações: ${msg}`);
        res.json({ success: false, error: 'Erro ao consultar o Gemini. Verifique sua API Key.' });
    }
});



async function downloadImage(url, index, directory) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        
        let extension = path.extname(new URL(url).pathname) || '.jpg';
        if (extension.length > 5) extension = '.jpg';
        
        
        const filename = `${String(index + 1).padStart(3, '0')}${extension}`;
        const filePath = path.join(directory, filename);
        
        await fs.writeFile(filePath, response.data);

        
        
        await smartCropImage(filePath);
        

        return { status: 'SUCCESS' };
    } catch (error) { 
        
        return { status: 'FAILURE' }; 
    }
}

async function smartCropImage(filePath) {
    try {
        const image = sharp(filePath);
        const metadata = await image.metadata();

        
        if (metadata.height <= MAX_IMAGE_HEIGHT) {
            return; 
        }

        

        const totalParts = Math.ceil(metadata.height / MAX_IMAGE_HEIGHT);
        const originalName = path.parse(filePath).name; 
        const ext = path.parse(filePath).ext;          
        const dir = path.dirname(filePath);

        const cropPromises = [];

        for (let i = 0; i < totalParts; i++) {
            const startY = i * MAX_IMAGE_HEIGHT;
            
            const extractHeight = Math.min(MAX_IMAGE_HEIGHT, metadata.height - startY);

            
            
            const partIndex = String(i).padStart(2, '0');
            const outputName = `${originalName}_${partIndex}${ext}`;
            const outputPath = path.join(dir, outputName);

            const promise = image
                .clone() 
                .extract({ left: 0, top: startY, width: metadata.width, height: extractHeight })
                .toFile(outputPath);
            
            cropPromises.push(promise);
        }

        
        await Promise.all(cropPromises);

        
        
        
        await fs.unlink(filePath); 
        
        return { sliced: true, parts: totalParts };

    } catch (error) {
        console.error(`Erro no Smart Crop: ${error.message}`);
        return { sliced: false };
    }
}


const FALLBACK_SELECTORS = ['#readerarea img', '.reading-content img', '.entry-content img', '.wp-manga-chapter-img', '#image-container img', '.blob_content img'];

app.post('/scrape', async (req, res) => {
    const { url, siteName, chapterName, selector } = req.body;
    
    
    const urlObj = new URL(url);
    const domain = urlObj.hostname.split('.')[0]; 
    const safeSite = siteName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeChapter = chapterName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    
    let searchOrder = [...FALLBACK_SELECTORS];
    if (selector && selector.trim() !== "") searchOrder.unshift(selector);
    searchOrder = [...new Set(searchOrder)];

    let page = null;

    try {
        log('INFO', `Iniciando Download: ${safeSite} - Cap ${safeChapter}`);
        
        
        const chapterDir = path.join(ARQUIVOS_ROOT, domain, safeSite, safeChapter);
        const originalDir = path.join(chapterDir, 'original');
        await fs.mkdir(originalDir, { recursive: true });

        
        const browser = await getBrowser();
        page = await browser.newPage();

        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        
        await page.setViewport({ width: 1280, height: 800 });
        
        
        log('INFO', `Acessando URL...`, 10);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        let imageUrls = [];
        log('INFO', `Buscando imagens na página...`, 20);
        
        
        for (const currentSel of searchOrder) {
            try {
                
                try {
                    await page.waitForSelector(currentSel, { timeout: 3000 });
                } catch(e) { continue; } 

                const imagesFound = await page.evaluate((sel) => {
                    const el = document.querySelectorAll(sel);
                    return Array.from(el)
                        .map(img => img.getAttribute('data-src') || img.getAttribute('src') || img.getAttribute('data-lazy-src') || img.src)
                        .filter(src => src && src.startsWith('http'));
                }, currentSel);

                if (imagesFound.length > 0) { 
                    imageUrls = imagesFound; 
                    log('SUCCESS', `Imagens encontradas com seletor: ${currentSel}`);
                    break; 
                }
            } catch (e) { continue; }
        }

        
        await page.close();
        page = null; 

        if (imageUrls.length === 0) { 
            log('ERROR', 'Nenhuma imagem encontrada.');
            return res.json({ success: false, error: 'Seletor não encontrado ou site protegido.' }); 
        }

        
        log('INFO', `Iniciando download de ${imageUrls.length} imagens...`, 30);
        
        let downloadedCount = 0;
        
        const CONCURRENCY_LIMIT = 5;
        
        
        for (let i = 0; i < imageUrls.length; i += CONCURRENCY_LIMIT) {
            const chunk = imageUrls.slice(i, i + CONCURRENCY_LIMIT);
            const promises = chunk.map(async (u, idx) => {
                const globalIndex = i + idx;
                const res = await downloadImage(u, globalIndex, originalDir); 
                downloadedCount++;
                const progress = 30 + Math.floor((downloadedCount / imageUrls.length) * 70);
                log('INFO', `Baixada imagem ${downloadedCount}/${imageUrls.length}`, progress);
                return res;
            });
            await Promise.all(promises);
        }

        log('SUCCESS', `Download Completo! Salvo em ${domain}`, 100);
        res.json({ success: true, message: `Download concluído em '${domain}' (${imageUrls.length} imagens).` });

    } catch (error) {
        if (page) await page.close();
        log('ERROR', `Erro fatal: ${error.message}`);
        res.status(500).json({ error: 'Erro no servidor: ' + error.message });
    }
});


app.post('/translate', async (req, res) => {
    const { domain, siteName, chapterName, translator } = req.body; 
    
    
    try {
        const configPath = path.join(DIR_NAME, 'config/configv1.json');
        if (fsSync.existsSync(configPath)) {
            const configContent = await fs.readFile(configPath, 'utf8');
            const configJson = JSON.parse(configContent);
            if (!configJson.translator) configJson.translator = {};
            configJson.translator.translator = translator || 'gemini';
            await fs.writeFile(configPath, JSON.stringify(configJson, null, 2));
        }
    } catch (err) { console.error(err); }

    const runTranslationPromise = () => {
        return new Promise((resolve, reject) => {
            const chapterPath = path.join(ARQUIVOS_ROOT, domain, siteName, chapterName);
            const inputDir = path.join(chapterPath, 'original');
            const outputDir = path.join(chapterPath, 'traduzido');

            if (!fsSync.existsSync(outputDir)) fsSync.mkdirSync(outputDir, { recursive: true });

            const command = `"${VENV_PATH}" && set GEMINI_API_KEY=${API_KEY} && python -m manga_translator local --use-gpu -v --ignore-errors --config-file tradutor/config/configv1.json -v -i "${inputDir}" -o "${outputDir}" --overwrite`;

            log('INFO', `Iniciando IA de Tradução (${translator})...`, 0);
            
            const process = exec(command, { cwd: PROJECT_ROOT });
            
            
            process.stdout.on('data', (d) => {
                const line = d.toString().trim();
                console.log(`[PY]: ${line}`); 
                
                
                if (line.includes('Translation')) {
                    log('INFO', `Traduzindo página...`);
                } else if (line.includes('Rendering')) {
                    log('INFO', `Renderizando texto...`);
                } else if (line.includes('saved to')) {
                    log('SUCCESS', `Página salva.`);
                }
            });

            process.stderr.on('data', (d) => {
                console.error(`[PY-ERR]: ${d}`);
                
                if (!d.includes('tqdm')) { 
                     
                }
            });

            process.on('close', (code) => {
                if (code === 0) {
                    log('SUCCESS', 'Tradução Finalizada!', 100);
                    resolve();
                } else {
                    log('ERROR', `Tradutor falhou (Código ${code})`);
                    reject(new Error(`Tradutor saiu com código ${code}`));
                }
            });
        });
    };

    try {
        await runTranslationPromise();
        res.json({ success: true, message: 'Tradução concluída!' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro durante a tradução.' });
    }
});

app.post('/fetch-chapters', async (req, res) => {
    const { seriesUrl, selector } = req.body;

    if (!seriesUrl) {
        return res.json({ success: false, error: 'URL da série não fornecida.' });
    }

    let page = null;
    try {
        log('INFO', `Buscando lista de capítulos em: ${seriesUrl}`);

        
        const browser = await getBrowser();
        page = await browser.newPage();

        
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        
        await page.goto(seriesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        
        const searchSelector = selector || '#chapterlist a';

        
        const chapterLinks = await page.evaluate((sel) => {
            
            const elements = document.querySelectorAll(sel);
            
            return Array.from(elements)
                .map(el => {
                    
                    return el.getAttribute('href') || el.closest('a')?.getAttribute('href');
                })
                .filter(href => href && href.startsWith('http')); 
        }, searchSelector);

        await page.close();
        page = null;

        
        
        const uniqueLinks = [...new Set(chapterLinks)];

        
        
        

        if (uniqueLinks.length === 0) {
            log('WARN', 'Nenhum capítulo encontrado.');
            return res.json({ success: false, error: 'Nenhum link encontrado com este seletor. Tente ajustar o seletor.' });
        }

        log('SUCCESS', `Lista recuperada: ${uniqueLinks.length} capítulos encontrados.`);
        
        res.json({ success: true, links: uniqueLinks });

    } catch (error) {
        if (page) await page.close();
        log('ERROR', `Erro ao buscar capítulos: ${error.message}`);
        res.status(500).json({ success: false, error: 'Erro ao buscar lista de capítulos.' });
    }
});

app.delete('/delete-chapter', async (req, res) => {
    
    const { domain, siteName, chapterName } = req.body;
    const chapterPath = path.join(ARQUIVOS_ROOT, domain, siteName, chapterName);
    try {
        if (fsSync.existsSync(chapterPath)) {
            await fs.rm(chapterPath, { recursive: true, force: true });
            res.json({ success: true, message: 'Capítulo excluído.' });
        } else {
            res.json({ success: false, error: 'Pasta não encontrada.' });
        }
    } catch (error) { res.status(500).json({ success: false, error: 'Erro ao excluir.' }); }
});

app.listen(PORT, () => {
    log('SUCCESS', `Servidor rodando em http://localhost:${PORT}`);
});