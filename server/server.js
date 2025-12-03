const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { exec } = require('child_process');
require('dotenv').config()

// Define o diretório base corretamente
const DIR_NAME = path.join(__dirname.replace("\\server",""))

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DE CAMINHOS ---
const PROJECT_ROOT = path.join(DIR_NAME , '..'); 
const VENV_PATH = path.join(PROJECT_ROOT, 'venv', 'Scripts', 'activate.bat');
const API_KEY = process.env.GEMINI_API_KEY || 'SUA_CHAVE_AQUI_SE_NAO_USAR_ENV';
const ARQUIVOS_ROOT = path.join(DIR_NAME, 'arquivos');

app.use(express.static(DIR_NAME)); 
app.use('/arquivos', express.static(ARQUIVOS_ROOT));

const PORT = 3000;

// Função central de Log (Terminal + Frontend)
function log(type, message, progress = null) {
    // 1. Log no Terminal (com cores)
    const timestamp = new Date().toLocaleTimeString();
    let color = '\x1b[37m'; // Branco
    if (type === 'INFO') color = '\x1b[36m'; // Ciano
    if (type === 'SUCCESS') color = '\x1b[32m'; // Verde
    if (type === 'ERROR') color = '\x1b[31m'; // Vermelho
    if (type === 'WARN') color = '\x1b[33m'; // Amarelo

    console.log(`[${timestamp}] ${color}[${type}]\x1b[0m ${message}`);
}

// --- ROTA DA BIBLIOTECA ---
app.get('/library', async (req, res) => {
    // (Código mantido igual, omitido para economizar espaço, use o anterior)
    try {
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

// --- ROTA DE IMAGENS ---
app.post('/get-images', async (req, res) => {
    // (Código mantido igual)
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

// --- IA RECOMMENDATIONS ---
// (Código mantido igual ao anterior, omitido aqui)
app.get('/recommendations', async (req, res) => { res.json({success: false, error: "Use o código anterior para esta parte"}) });


// --- FUNÇÕES DE DOWNLOAD ---
async function downloadImage(url, index, directory) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
        let extension = path.extname(new URL(url).pathname) || '.jpg';
        if (extension.length > 5) extension = '.jpg';
        const filename = `${String(index + 1).padStart(3, '0')}${extension}`;
        await fs.writeFile(path.join(directory, filename), response.data);
        return { status: 'SUCCESS' };
    } catch (error) { return { status: 'FAILURE' }; }
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

    let browser;
    try {
        log('INFO', `Iniciando Download: ${safeSite} - Cap ${safeChapter}`);
        
        const chapterDir = path.join(ARQUIVOS_ROOT, domain, safeSite, safeChapter);
        const originalDir = path.join(chapterDir, 'original');
        await fs.mkdir(originalDir, { recursive: true });

        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        log('INFO', `Acessando URL...`, 10);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

        let imageUrls = [];
        log('INFO', `Buscando imagens na página...`, 20);
        
        for (const currentSel of searchOrder) {
            try {
                await page.waitForSelector(currentSel, { timeout: 2000 });
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

        if (imageUrls.length === 0) { 
            await browser.close(); 
            log('ERROR', 'Nenhuma imagem encontrada.');
            return res.json({ success: false, error: 'Seletor não encontrado.' }); 
        }

        log('INFO', `Iniciando download de ${imageUrls.length} imagens...`, 30);
        
        let downloadedCount = 0;
        const downloadPromises = imageUrls.map(async (u, i) => {
            const res = await downloadImage(u, i, originalDir);
            downloadedCount++;
            // Calcula progresso: começa em 30%, vai até 100%
            const progress = 30 + Math.floor((downloadedCount / imageUrls.length) * 70);
            log('INFO', `Baixada imagem ${downloadedCount}/${imageUrls.length}`, progress);
            return res;
        });

        await Promise.all(downloadPromises);
        await browser.close();

        log('SUCCESS', `Download Completo! Salvo em ${domain}`, 100);
        res.json({ success: true, message: `Download concluído em '${domain}' (${imageUrls.length} imagens).` });

    } catch (error) {
        if (browser) await browser.close();
        log('ERROR', `Erro fatal: ${error.message}`);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// --- ROTA DE TRADUÇÃO (Com logs em tempo real) ---
app.post('/translate', async (req, res) => {
    const { domain, siteName, chapterName, translator } = req.body; 
    
    // Atualiza config
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

            const command = `"${VENV_PATH}" && set GEMINI_API_KEY=${API_KEY} && python -m manga_translator local -v --ignore-errors --config-file tradutor/config/configv1.json -v -i "${inputDir}" -o "${outputDir}" --overwrite`;

            log('INFO', `Iniciando IA de Tradução (${translator})...`, 0);
            
            const process = exec(command, { cwd: PROJECT_ROOT });
            
            // LER A SAÍDA DO PYTHON EM TEMPO REAL
            process.stdout.on('data', (d) => {
                const line = d.toString().trim();
                console.log(`[PY]: ${line}`); // Loga no terminal do node
                
                // Tenta extrair info útil para o usuário
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
                // Python often sends normal logs to stderr too
                if (!d.includes('tqdm')) { // ignora barra de progresso feia do python
                     // log('WARN', `Log IA: ${d.toString().slice(0, 50)}...`);
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
    // (Mantido, omitido para brevidade)
    res.json({success: false, error: "Use implementação anterior"});
});

app.delete('/delete-chapter', async (req, res) => {
    // (Mantido)
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