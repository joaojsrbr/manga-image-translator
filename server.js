const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises'); // Usando promises para leitura/escrita async
const fsSync = require('fs');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { exec } = require('child_process');
require('dotenv').config()

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DE CAMINHOS ---
const PROJECT_ROOT = path.join(__dirname, '..'); 
const VENV_PATH = path.join(PROJECT_ROOT, 'venv', 'Scripts', 'activate.bat');
const API_KEY = process.env.GEMINI_API_KEY || 'SUA_CHAVE_AQUI_SE_NAO_USAR_ENV';
const ARQUIVOS_ROOT = path.join(__dirname, 'arquivos');

app.use(express.static(__dirname)); 
app.use('/arquivos', express.static(ARQUIVOS_ROOT));

const PORT = 3000;

// ... (ROTAS /library e /get-images MANTIDAS IGUAIS) ...

app.get('/library', async (req, res) => {
    try {
        const library = [];
        if (!fsSync.existsSync(ARQUIVOS_ROOT)) return res.json([]);
        const mangas = await fs.readdir(ARQUIVOS_ROOT);
        for (const manga of mangas) {
            const mangaPath = path.join(ARQUIVOS_ROOT, manga);
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
                if (chaptersData.length > 0) library.push({ name: manga, chapters: chaptersData });
            }
        }
        res.json(library);
    } catch (error) { console.error(error); res.json([]); }
});

app.post('/get-images', async (req, res) => {
    const { siteName, chapterName, type } = req.body; 
    const folderType = type === 'translated' ? 'traduzido' : 'original';
    const dirPath = path.join(ARQUIVOS_ROOT, siteName, chapterName, folderType);
    try {
        if (!fsSync.existsSync(dirPath)) return res.json({ success: false, error: `Pasta '${folderType}' não encontrada.` });
        const files = await fs.readdir(dirPath);
        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).sort();
        res.json({ success: true, images });
    } catch (error) { res.json({ success: false, error: error.message }); }
});

// ... (DOWNLOADER E SCRAPER MANTIDOS IGUAIS) ...

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
    const safeSite = siteName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeChapter = chapterName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    let searchOrder = [...FALLBACK_SELECTORS];
    if (selector && selector.trim() !== "") searchOrder.unshift(selector);
    searchOrder = [...new Set(searchOrder)];

    let browser;
    try {
        const chapterDir = path.join(ARQUIVOS_ROOT, safeSite, safeChapter);
        const originalDir = path.join(chapterDir, 'original');
        await fs.mkdir(originalDir, { recursive: true });

        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

        let imageUrls = [];
        for (const currentSel of searchOrder) {
            try {
                await page.waitForSelector(currentSel, { timeout: 2000 });
                const imagesFound = await page.evaluate((sel) => {
                    const el = document.querySelectorAll(sel);
                    return Array.from(el)
                        .map(img => img.getAttribute('data-src') || img.getAttribute('src') || img.getAttribute('data-lazy-src') || img.src)
                        .filter(src => src && src.startsWith('http'));
                }, currentSel);
                if (imagesFound.length > 0) { imageUrls = imagesFound; break; }
            } catch (e) { continue; }
        }

        if (imageUrls.length === 0) { await browser.close(); return res.json({ success: false, error: 'Seletor não encontrado.' }); }

        const downloadPromises = imageUrls.map((u, i) => downloadImage(u, i, originalDir));
        await Promise.all(downloadPromises);
        await browser.close();

        res.json({ success: true, message: `Download concluído (${imageUrls.length} imagens).` });

    } catch (error) {
        if (browser) await browser.close();
        console.error(error);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

// --- ROTA DE TRADUÇÃO ATUALIZADA (Escreve no JSON) ---
app.post('/translate', async (req, res) => {
    const { siteName, chapterName, translator } = req.body; // Recebe o tradutor escolhido
    
    // 1. Atualizar o configv1.json
    try {
        const configPath = path.join(__dirname, 'configv1.json');
        
        // Lê o arquivo atual
        const configContent = await fs.readFile(configPath, 'utf8');
        const configJson = JSON.parse(configContent);

        // Atualiza apenas o campo translator
        if (!configJson.translator) configJson.translator = {};
        configJson.translator.translator = translator || 'gemini'; // Padrão gemini

        // Salva de volta
        await fs.writeFile(configPath, JSON.stringify(configJson, null, 2));
        console.log(`[CONFIG] Motor de tradução atualizado para: ${configJson.translator.translator}`);

    } catch (err) {
        console.error("Erro ao atualizar configv1.json:", err);
        return res.status(500).json({ success: false, error: 'Erro ao salvar configuração.' });
    }

    // 2. Rodar o processo de tradução
    const runTranslationPromise = () => {
        return new Promise((resolve, reject) => {
            const chapterPath = path.join(ARQUIVOS_ROOT, siteName, chapterName);
            const inputDir = path.join(chapterPath, 'original');
            const outputDir = path.join(chapterPath, 'traduzido');

            if (!fsSync.existsSync(outputDir)) fsSync.mkdirSync(outputDir, { recursive: true });

            const command = `"${VENV_PATH}" && set GEMINI_API_KEY=${API_KEY} && python -m manga_translator local -v --ignore-errors --config-file tradutor/configv1.json -v -i "${inputDir}" -o "${outputDir}" --overwrite`;

            console.log(`[TRADUTOR] Iniciando: ${siteName} - ${chapterName}`);
            const process = exec(command, { cwd: PROJECT_ROOT });
            
            process.stdout.on('data', (d) => console.log(`[PY]: ${d}`));
            process.stderr.on('data', (d) => console.error(`[PY-ERR]: ${d}`));

            process.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Tradutor saiu com código ${code}`));
            });
        });
    };

    try {
        await runTranslationPromise();
        res.json({ success: true, message: 'Tradução concluída com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Erro durante a tradução.' });
    }
});

app.delete('/delete-chapter', async (req, res) => {
    const { siteName, chapterName } = req.body;
    const chapterPath = path.join(ARQUIVOS_ROOT, siteName, chapterName);
    try {
        if (fsSync.existsSync(chapterPath)) {
            await fs.rm(chapterPath, { recursive: true, force: true });
            const obraPath = path.join(ARQUIVOS_ROOT, siteName);
            const chaptersRemaining = await fs.readdir(obraPath);
            if (chaptersRemaining.length === 0) await fs.rm(obraPath, { recursive: true, force: true });
            res.json({ success: true, message: 'Capítulo excluído.' });
        } else {
            res.json({ success: false, error: 'Pasta não encontrada.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao excluir.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});