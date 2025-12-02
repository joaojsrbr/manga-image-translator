const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { exec } = require('child_process');
require('dotenv').config()

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DE CAMINHOS ---
// Raiz do projeto "Pai" (onde está o venv)
const PROJECT_ROOT = path.join(__dirname, '..'); 
const VENV_PATH = path.join(PROJECT_ROOT, 'venv', 'Scripts', 'activate.bat');
const API_KEY = process.env.API_KEY;

// Nova Raiz de Arquivos: tradutor/arquivos
const ARQUIVOS_ROOT = path.join(__dirname, 'arquivos');

// 1. Serve o frontend
app.use(express.static(__dirname)); 

// 2. Serve a pasta "arquivos" inteira para o navegador acessar as imagens
// A URL será: http://localhost:3000/arquivos/NomeObra/Capitulo/original/imagem.jpg
app.use('/arquivos', express.static(ARQUIVOS_ROOT));

const PORT = 3000;

// --- ROTA DA BIBLIOTECA (Atualizada para nova estrutura) ---
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
                    
                    // Verifica se é uma pasta de capitulo válida
                    if ((await fs.stat(chapPath)).isDirectory()) {
                        // Verifica se existe pasta 'traduzido' dentro dela
                        const transPath = path.join(chapPath, 'traduzido');
                        const hasTranslation = fsSync.existsSync(transPath);
                        
                        // Verifica se tem arquivos na tradução
                        let hasFiles = false;
                        if(hasTranslation) {
                            const files = await fs.readdir(transPath);
                            hasFiles = files.length > 0;
                        }

                        chaptersData.push({ name: chap, hasTranslation: hasFiles });
                    }
                }
                if (chaptersData.length > 0) {
                    library.push({ name: manga, chapters: chaptersData });
                }
            }
        }
        res.json(library);
    } catch (error) {
        console.error(error);
        res.json([]);
    }
});

// --- ROTA DE LEITURA DE IMAGENS ---
app.post('/get-images', async (req, res) => {
    const { siteName, chapterName, type } = req.body; 
    // type vem como 'original' ou 'traduzido' (frontend manda 'translated' -> convertemos)
    
    const folderType = type === 'translated' ? 'traduzido' : 'original';
    const dirPath = path.join(ARQUIVOS_ROOT, siteName, chapterName, folderType);

    try {
        if (!fsSync.existsSync(dirPath)) {
            return res.json({ success: false, error: `Pasta '${folderType}' não encontrada.` });
        }
        const files = await fs.readdir(dirPath);
        const images = files.filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).sort();
        res.json({ success: true, images });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// --- FUNÇÃO AUXILIAR DE DOWNLOAD ---
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

// --- FUNÇÃO DE TRADUÇÃO (Atualizada para caminhos absolutos) ---
async function runTranslator(siteName, chapterName) {
    console.log(`--- TRADUZINDO: ${siteName} - Cap ${chapterName} ---`);
    
    // Caminhos Absolutos para entrada e saída específica deste capítulo
    const chapterPath = path.join(ARQUIVOS_ROOT, siteName, chapterName);
    const inputDir = path.join(chapterPath, 'original');
    const outputDir = path.join(chapterPath, 'traduzido');

    // Cria pasta de saída
    if (!fsSync.existsSync(outputDir)) fsSync.mkdirSync(outputDir, { recursive: true });

    // Comando aponta direto para as pastas específicas
    const command = `"${VENV_PATH}" && set GEMINI_API_KEY=${API_KEY} && python -m manga_translator local -v --ignore-errors --config-file configv1.json --use-gpu -v -i "${inputDir}" -o "${outputDir}"`;
    
    // Executa a partir do ROOT do projeto pai (para achar o configv1.json)
    const process = exec(command, { cwd: PROJECT_ROOT });
    
    process.stdout.on('data', (d) => console.log(`[TRADUTOR]: ${d}`));
    process.stderr.on('data', (d) => console.error(`[LOG]: ${d}`));
}

app.post('/scrape', async (req, res) => {
    const { url, siteName, chapterName, selector } = req.body;
    const cssSelector = selector || '#readerarea img';
    const safeSite = siteName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeChapter = chapterName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    try {
        // Nova Estrutura: arquivos/site/capitulo/original
        const chapterDir = path.join(ARQUIVOS_ROOT, safeSite, safeChapter);
        const originalDir = path.join(chapterDir, 'original');
        
        await fs.mkdir(originalDir, { recursive: true });

        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        try { await page.waitForSelector(cssSelector, { timeout: 10000 }); } catch (e) {}

        const imageUrls = await page.evaluate((sel) => {
            const el = document.querySelectorAll(sel);
            return Array.from(el).map(img => img.src);
        }, cssSelector);

        if (imageUrls.length === 0) {
            await browser.close();
            return res.json({ error: 'Nenhuma imagem encontrada.' });
        }

        const downloadPromises = imageUrls.map((u, i) => downloadImage(u, i, originalDir));
        await Promise.all(downloadPromises);
        await browser.close();

        runTranslator(safeSite, safeChapter);
        res.json({ success: true, message: 'Download OK. Tradução iniciada.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro no servidor.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Imagens serão salvas em: ${ARQUIVOS_ROOT}`);
});