const API_URL = 'http://localhost:3000';
let estadoAtual = { 
    domain: null, 
    obra: null, 
    capitulo: null, 
    modo: null, 
    viewMode: 'webtoon', 
    pageIndex: 0, 
    imagesCache: [],
    zoomLevel: 20 
};

window.onload = () => { carregarBiblioteca(); setupAtalhos(); };

// --- IA ---
async function pedirSugestoesIA() {
    const modal = document.getElementById('aiModal');
    const content = document.getElementById('aiContent');
    modal.showModal();
    content.innerHTML = `<div class="flex flex-col items-center justify-center py-10 gap-4"><div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p class="text-zinc-400 text-sm animate-pulse">Lendo sua biblioteca e consultando o Gemini...</p></div>`;
    try {
        const res = await fetch(`${API_URL}/recommendations`);
        const data = await res.json();
        if (data.success) {
            let html = data.recommendation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\* /g, '<li>').replace(/\n/g, '<br>');
            content.innerHTML = `<div class="space-y-4 text-sm">${html}</div>`;
        } else { content.innerHTML = `<p class="text-red-400 text-center">Erro: ${data.error}</p>`; }
    } catch (e) { content.innerHTML = `<p class="text-red-400 text-center">Erro de conexão.</p>`; }
}

function aplicarZoom(valor) {
    estadoAtual.zoomLevel = parseInt(valor);
    
    // Atualiza UI
    document.getElementById('zoomSlider').value = estadoAtual.zoomLevel;
    document.getElementById('zoomValue').innerText = `${estadoAtual.zoomLevel}%`;

    const imagens = document.querySelectorAll('#imageContainer img');
    
    if (estadoAtual.viewMode === 'webtoon') {
        // No modo Webtoon, o zoom controla a LARGURA máxima (max-width)
        // 100% no slider = 768px (3xl do tailwind) que é um tamanho bom de leitura
        // Vamos permitir ir além disso
        imagens.forEach(img => {
            // Se zoom for 100, usa o padrão. Se for maior, expande.
            // Convertendo: 100% -> 50vw (metade da tela), 200% -> 100vw
            const widthPercent = Math.min(100, Math.max(10, estadoAtual.zoomLevel / 2)); // Ajuste fino
            
            // Mas para ser mais responsivo, vamos alterar o max-width em pixels ou porcentagem direta
            if (estadoAtual.zoomLevel <= 100) {
                // De 10% a 100% de largura do container limitado
                img.style.maxWidth = `${estadoAtual.zoomLevel}%`; 
                img.style.width = 'auto';
            } else {
                // Acima de 100%, força largura maior que o container (scroll horizontal aparece)
                img.style.maxWidth = 'none';
                img.style.width = `${estadoAtual.zoomLevel}%`;
            }
        });
    } else {
        // No modo Página, o zoom usa Transform Scale
        imagens.forEach(img => {
            const scale = estadoAtual.zoomLevel / 100;
            img.style.transform = `scale(${scale})`;
            img.style.transformOrigin = 'top center'; // Zoom a partir do topo
            
            // Ajuste de margem para o scroll funcionar se a imagem crescer muito
            if (scale > 1) {
                img.style.marginTop = `${(scale - 1) * 20}px`; 
                img.style.marginBottom = `${(scale - 1) * 20}px`;
            } else {
                img.style.margin = '0';
            }
        });
    }
}

function ajustarZoom(delta) {
    let novoZoom = estadoAtual.zoomLevel + delta;
    if (novoZoom < 10) novoZoom = 10;
    if (novoZoom > 500) novoZoom = 500;
    aplicarZoom(novoZoom);
}

function resetarZoom() {
    aplicarZoom(20);
}

// --- RENDERIZAÇÃO ATUALIZADA ---

function renderizarImagens() {
    const container = document.getElementById('imageContainer');
    const controls = document.getElementById('pageControls');
    const counter = document.getElementById('pageCounter');
    
    container.innerHTML = '';

    if (estadoAtual.viewMode === 'webtoon') {
        controls.classList.add('hidden');
        container.classList.remove('flex', 'items-center', 'justify-center', 'h-full', 'overflow-hidden');
        container.classList.add('overflow-y-auto', 'block');

        estadoAtual.imagesCache.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.className = "mx-auto shadow-2xl mb-0 block transition-all duration-200 ease-out"; 
            // Removemos as classes fixas de width (max-w-3xl) para o JS controlar
            img.loading = "lazy";
            container.appendChild(img);
        });

    } else {
        controls.classList.remove('hidden');
        container.classList.remove('overflow-y-auto', 'block');
        container.classList.add('flex', 'items-center', 'justify-center', 'h-full', 'overflow-hidden', 'bg-black');
        
        const src = estadoAtual.imagesCache[estadoAtual.pageIndex];
        const img = document.createElement('img');
        img.src = src;
        // max-h-full garante que caiba na tela inicialmente
        img.className = "max-h-full max-w-full object-contain shadow-2xl transition-transform duration-200 ease-out"; 
        container.appendChild(img);

        counter.innerText = `${estadoAtual.pageIndex + 1} / ${estadoAtual.imagesCache.length}`;
    }

    // Reaplica o zoom atual nas novas imagens
    aplicarZoom(estadoAtual.zoomLevel);
}

// --- ATALHOS DE TECLADO ---
function setupAtalhos() {
    document.addEventListener('keydown', (e) => {
        // Se estiver focado num input, ignora atalhos
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        // Navegação Page Mode
        if (estadoAtual.viewMode === 'page') {
            if (e.key === 'ArrowRight' || e.key === 'd') mudarPagina(1);
            if (e.key === 'ArrowLeft' || e.key === 'a') mudarPagina(-1);
        }

        // Zoom (+ e -)
        if (e.key === '+' || e.key === '=') ajustarZoom(2);
        if (e.key === '-' || e.key === '_') ajustarZoom(-2);
        if (e.key === '0') resetarZoom();

        // Atalho URL
        if (e.key === '/') {
            e.preventDefault();
            document.getElementById('url').focus();
        }
    });
}

// --- MODOS DE LEITURA ---
function mudarModoLeitura(modo) {
    estadoAtual.viewMode = modo;
    const btnWeb = document.getElementById('btnWebtoon');
    const btnPage = document.getElementById('btnPage');
    if (modo === 'webtoon') {
        btnWeb.className = "px-3 py-1 rounded text-[10px] font-medium transition-all bg-zinc-700 text-white shadow";
        btnPage.className = "px-3 py-1 rounded text-[10px] font-medium transition-all text-zinc-500 hover:text-zinc-300";
    } else {
        btnPage.className = "px-3 py-1 rounded text-[10px] font-medium transition-all bg-primary text-white shadow";
        btnWeb.className = "px-3 py-1 rounded text-[10px] font-medium transition-all text-zinc-500 hover:text-zinc-300";
    }
    if (estadoAtual.imagesCache.length > 0) renderizarImagens();
}

function mudarPagina(delta) {
    if (estadoAtual.viewMode !== 'page') return;
    const novaPagina = estadoAtual.pageIndex + delta;
    if (novaPagina >= 0 && novaPagina < estadoAtual.imagesCache.length) {
        estadoAtual.pageIndex = novaPagina;
        renderizarImagens();
    }
}

// --- BIBLIOTECA ---
async function carregarBiblioteca() {
    const listEl = document.getElementById('libraryList');
    try {
        const res = await fetch(`${API_URL}/library`);
        const library = await res.json();
        listEl.innerHTML = '';
        if (library.length === 0) { listEl.innerHTML = `<div class="text-center mt-10 text-zinc-600 text-xs">Vazio.</div>`; return; }
        document.getElementById('selector').value = "#readerarea img";
        document.getElementById('seriesSelector').value = "#chapterlist a";
        library.forEach(obra => {
            const cleanName = obra.name.replace(/_/g, ' ');
            const details = document.createElement('details');
            details.className = "group mb-1 overflow-hidden rounded-lg border border-transparent open:border-zinc-800 open:bg-zinc-900/30 transition-all";
            const summary = document.createElement('summary');
            summary.className = "cursor-pointer p-2 flex items-center justify-between text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition-colors text-xs font-medium select-none";
            summary.innerHTML = `<div class="flex flex-col overflow-hidden"><div class="flex items-center gap-2"><svg class="w-3 h-3 transition-transform group-open:rotate-90 text-zinc-600 group-hover:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg><span class="truncate capitalize" title="${cleanName}">${cleanName}</span></div><span class="text-[9px] text-zinc-600 ml-5 truncate" title="${obra.domain}">${obra.domain}</span></div><span class="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-px rounded ml-2">${obra.chapters.length}</span>`;
            const ul = document.createElement('ul');
            ul.className = "pt-1 pb-2 px-2 space-y-1 bg-black/20";
            
            obra.chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

            // console.log(obra.chapters);

            obra.chapters.forEach(cap => {
                const li = document.createElement('li');
                li.className = "fade-in bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 rounded p-2 flex flex-col gap-2 group/item transition-all";
                let transBtnHtml = cap.hasTranslation 
                    ? `<button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'translated')" class="flex-1 text-[10px] py-1 rounded transition border bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary hover:text-white font-semibold">Ler Traduzido</button>`
                    : `<button onclick="traduzirCapitulo(this, '${obra.domain}', '${obra.name}', '${cap.name}')" class="flex-1 text-[10px] py-1 rounded transition border bg-zinc-900 hover:bg-primary hover:text-white border-zinc-700 text-zinc-400 font-medium flex justify-center items-center gap-1 group/trans"><span>✨</span> Traduzir</button>`;
                
                li.innerHTML = `<div class="flex justify-between items-center"><div class="flex items-center gap-1.5"><div class="w-1 h-1 rounded-full ${cap.hasTranslation ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'}"></div><span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Cap. ${cap.name}</span></div><button onclick="excluirCapitulo(event, '${obra.domain}', '${obra.name}', '${cap.name}')" class="text-zinc-600 hover:text-red-400 transition opacity-0 group-hover/item:opacity-100 p-1" title="Apagar"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div><div class="flex gap-1.5"><button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'original')" class="flex-1 text-[10px] py-1 rounded bg-zinc-900 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition">Original</button>${transBtnHtml}</div>`;
                ul.appendChild(li);
            });
            details.appendChild(summary);
            details.appendChild(ul);
            listEl.appendChild(details);
        });
    } catch (e) { console.error(e); showToast('Erro ao carregar biblioteca.', 'error'); }
}

// --- AÇÕES ---
async function abrirCapitulo(domain, obra, capitulo, modo) {
    estadoAtual = { ...estadoAtual, domain, obra, capitulo, modo, pageIndex: 0, imagesCache: [] };
    document.getElementById('currentTitle').innerText = `${obra.replace(/_/g, ' ')} / Cap. ${capitulo}`;
    const statusDiv = document.getElementById('currentStatus');
    statusDiv.innerHTML = modo === 'translated' ? `<span class="text-[10px] text-green-400 font-medium flex items-center gap-1">🇧🇷 Traduzido</span>` : `<span class="text-[10px] text-zinc-400 font-medium flex items-center gap-1">🇯🇵 Original</span>`;
    const container = document.getElementById('imageContainer');
    container.innerHTML = `<div class="h-full flex flex-col items-center justify-center gap-3"><div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div><span class="text-xs text-zinc-500 animate-pulse">Carregando...</span></div>`;

    try {
        const res = await fetch(`${API_URL}/get-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, siteName: obra, chapterName: capitulo, type: modo })
        });
        const data = await res.json();
        if (!data.success) { container.innerHTML = `<div class="mt-20 text-center text-zinc-500 text-xs">Imagens não encontradas.</div>`; return; }
        
        const folderName = modo === 'translated' ? 'traduzido' : 'original';
        estadoAtual.imagesCache = data.images.map(img => `/arquivos/${domain}/${obra}/${capitulo}/${folderName}/${img}`);
        renderizarImagens();
        container.focus();
    } catch (e) { container.innerHTML = '<p class="text-red-500 mt-10 text-center">Erro ao carregar.</p>'; }
}

async function baixarCapitulo() {
    const btn = document.getElementById('btnDownload');
    const indicator = document.getElementById('loading-indicator');
    const url = document.getElementById('url').value;
    const selector = document.getElementById('selector').value;
    const siteName = document.getElementById('siteName').value;
    const chapterName = document.getElementById('chapterName').value;
    if(!url || !siteName || !chapterName) return showToast("Preencha todos os campos", 'error');
    btn.disabled = true;
    indicator.classList.remove('hidden');
    try {
        const res = await fetch(`${API_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, siteName, chapterName, selector })
        });
        const data = await res.json();
        if (data.success) { showToast('Download concluído!', 'success'); carregarBiblioteca(); } else { showToast(data.error, 'error'); }
    } catch (e) { showToast('Erro de conexão.', 'error'); }
    btn.disabled = false;
    indicator.classList.add('hidden');
}

async function traduzirCapitulo(btnElement, domain, siteName, chapterName) {
    const originalText = btnElement.innerHTML;
    // const translatorEngine = document.getElementById('translatorType').value || 'gemini';
    const translatorEngine = 'gemini';
    btnElement.disabled = true;
    btnElement.innerHTML = `<svg class="animate-spin h-3 w-3 text-white mr-1" ...></svg> Traduzindo...`;
    showToast(`Iniciando tradução...`, 'success');
    try {
        const res = await fetch(`${API_URL}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, siteName, chapterName, translator: translatorEngine })
        });
        const data = await res.json();
        if (data.success) { showToast('Tradução finalizada!', 'success'); carregarBiblioteca(); } else { showToast('Erro: ' + data.error, 'error'); btnElement.innerHTML = "Erro"; }
    } catch (e) { showToast('Erro de conexão.', 'error'); btnElement.disabled = false; btnElement.innerHTML = originalText; }
}

async function iniciarBulkDownload() {
    const seriesUrl = document.getElementById('seriesUrl').value;
    const seriesSelector = document.getElementById('seriesSelector').value;
    const btnBulk = document.getElementById('btnBulk');
    const progressArea = document.getElementById('bulkProgressArea');
    const statusText = document.getElementById('bulkStatusText');
    if (!seriesUrl) return showToast("Coloque a URL da obra!", 'error');
    btnBulk.disabled = true;
    try {
        const res = await fetch(`${API_URL}/fetch-chapters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesUrl, selector: seriesSelector }) });
        const data = await res.json();
        if (!data.success || data.links.length === 0) { showToast("Nenhum capítulo encontrado.", 'error'); btnBulk.disabled = false; return; }
        const links = data.links;
        progressArea.classList.remove('hidden');
        showToast(`Encontrados ${links.length} capítulos.`, 'success');
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const percent = Math.round(((i) / links.length) * 100);
            document.getElementById('bulkProgressBar').style.width = `${percent}%`;
            document.getElementById('bulkCounter').innerText = `${i + 1}/${links.length}`;
            statusText.innerText = `Baixando...`;
            document.getElementById('url').value = link;
            autoPreencher(); 
            const siteName = document.getElementById('siteName').value;
            const chapterName = document.getElementById('chapterName').value;
            const imgSelector = document.getElementById('selector').value;
            try {
                await fetch(`${API_URL}/scrape`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link, siteName, chapterName, selector: imgSelector }) });
            } catch (err) {}
            await new Promise(r => setTimeout(r, 1000));
        }
        document.getElementById('bulkProgressBar').style.width = `100%`;
        statusText.innerText = "Concluído!";
        showToast("Processo finalizado!", 'success');
        carregarBiblioteca();
        btnBulk.disabled = false;
    } catch (e) { showToast("Erro no Bulk.", 'error'); btnBulk.disabled = false; }
}

async function excluirCapitulo(event, domain, siteName, chapterName) {
    event.stopPropagation();
    if(!confirm(`Apagar Capítulo ${chapterName}?`)) return;
    try {
        const res = await fetch(`${API_URL}/delete-chapter`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, siteName, chapterName })
        });
        const data = await res.json();
        if (data.success) { showToast('Removido', 'success'); carregarBiblioteca(); if(estadoAtual.obra === siteName) document.getElementById('imageContainer').innerHTML = ''; }
    } catch (e) { showToast('Erro.', 'error'); }
}

function autoPreencher() {
    const val = document.getElementById('url').value;
    if (!val) return;
    try {
        const cleanUrl = val.replace(/\/$/, ''); 
        const urlObj = new URL(cleanUrl);
        const segments = urlObj.pathname.split('/').filter(p => p.length > 0);
        const lastPart = segments[segments.length - 1]; 
        if (segments[segments.length - 2] === 'chapter') {
            const chapterNum = lastPart; 
            let rawName = segments[segments.length - 3]; 
            rawName = rawName.replace(/-[a-zA-Z0-9]+$/, '');
            document.getElementById('siteName').value = rawName.replace(/-/g, '_');
            document.getElementById('chapterName').value = chapterNum;
            return;
        }
        const matchChapterOnly = lastPart.match(/^chapter[-_](\d+(\.\d+)?)$/i);
        if (matchChapterOnly) {
            const chapterNum = matchChapterOnly[1];
            const namePart = segments[segments.length - 2];
            if (namePart) {
                document.getElementById('siteName').value = namePart.replace(/-/g, '_');
                document.getElementById('chapterName').value = chapterNum;
                return;
            }
        }
        const matchCombined = lastPart.match(/(.+)[-_]chapter[-_](\d+(\.\d+)?)/i);
        if (matchCombined) {
            const rawName = matchCombined[1];
            const rawChapter = matchCombined[2];
            document.getElementById('siteName').value = rawName.replace(/-/g, '_');
            document.getElementById('chapterName').value = rawChapter;
            return;
        }
    } catch (e) { }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-zinc-800 border-l-2 border-green-500 text-white' : 'bg-zinc-800 border-l-2 border-red-500 text-white';
    toast.className = `${bgClass} pl-3 pr-4 py-2.5 rounded shadow-2xl flex items-center gap-3 text-xs font-medium transform transition-all duration-300 translate-x-10 opacity-0 pointer-events-auto min-w-[200px]`;
    toast.innerHTML = `<span class="${type === 'success' ? 'text-green-400' : 'text-red-400'} text-sm">${type === 'success' ? '✓' : '✕'}</span>${message}`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-x-10', 'opacity-0'));
    setTimeout(() => { toast.classList.add('opacity-0', 'translate-x-10'); setTimeout(() => toast.remove(), 300); }, 3000);
}
