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


window.onload = () => {
    carregarBiblioteca(true);
    setupAtalhos();
    setInterval(() => { carregarBiblioteca(false); }, 20000);
};


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
    
    
    document.getElementById('zoomSlider').value = estadoAtual.zoomLevel;
    document.getElementById('zoomValue').innerText = `${estadoAtual.zoomLevel}%`;

    const imagens = document.querySelectorAll('#imageContainer img');
    
    if (estadoAtual.viewMode === 'webtoon') {
        imagens.forEach(img => {
            // const widthPercent = Math.min(100, Math.max(10, estadoAtual.zoomLevel / 2)); 
            if (estadoAtual.zoomLevel <= 100) {
                img.style.maxWidth = `${estadoAtual.zoomLevel}%`; 
                img.style.width = 'auto';
            } else {
                img.style.maxWidth = 'none';
                img.style.width = `${estadoAtual.zoomLevel}%`;
            }
        });
    } else {
        
        imagens.forEach(img => {
            const scale = estadoAtual.zoomLevel / 100;
            img.style.transform = `scale(${scale})`;
            img.style.transformOrigin = 'top center'; 
            
            
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
        
        img.className = "max-h-full max-w-full object-contain shadow-2xl transition-transform duration-200 ease-out"; 
        container.appendChild(img);

        counter.innerText = `${estadoAtual.pageIndex + 1} / ${estadoAtual.imagesCache.length}`;
    }

    
    aplicarZoom(estadoAtual.zoomLevel);
}





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


async function carregarBiblioteca(log) {
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

            

            obra.chapters.forEach(cap => {
                const li = document.createElement('li');
                
                
                const safeObra = obra.name.replace(/\s+/g, '_');
                const safeCap = cap.name.replace(/\./g, '-');
                const elementId = `chap-${obra.domain}-${safeObra}-${safeCap}`;
                li.id = elementId;

                
                const baseClass = "fade-in rounded p-2 flex flex-col gap-2 group/item transition-all border";
                
                const isCurrent = estadoAtual.obra === obra.name && estadoAtual.capitulo === cap.name;
                
                const activeClass = "bg-primary/10 border-primary shadow-[0_0_15px_rgba(139,92,246,0.15)] ring-1 ring-primary/30";
                const inactiveClass = "bg-zinc-800/40 hover:bg-zinc-800 border-zinc-700/50 hover:border-zinc-600";

                li.className = `${baseClass} ${isCurrent ? activeClass : inactiveClass}`;

                
                let transBtnHtml = cap.hasTranslation 
                    ? `<button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'translated')" class="flex-1 text-[10px] py-1 rounded transition border bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary hover:text-white font-semibold">Ler Traduzido</button>`
                    : `<button onclick="traduzirCapitulo(this, '${obra.domain}', '${obra.name}', '${cap.name}')" class="flex-1 text-[10px] py-1 rounded transition border bg-zinc-900 hover:bg-primary hover:text-white border-zinc-700 text-zinc-400 font-medium flex justify-center items-center gap-1 group/trans"><span>✨</span> Traduzir</button>`;
                
                li.innerHTML = `<div class="flex justify-between items-center"><div class="flex items-center gap-1.5"><div class="w-1 h-1 rounded-full ${cap.hasTranslation ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'}"></div><span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wide group-hover/item:text-zinc-200 transition-colors">Cap. ${cap.name}</span></div><button onclick="excluirCapitulo(event, '${obra.domain}', '${obra.name}', '${cap.name}')" class="text-zinc-600 hover:text-red-400 transition opacity-0 group-hover/item:opacity-100 p-1" title="Apagar"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div><div class="flex gap-1.5"><button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'original')" class="flex-1 text-[10px] py-1 rounded bg-zinc-900 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition">Original</button>${transBtnHtml}</div>`;
                
                ul.appendChild(li);
            });
            details.appendChild(summary);
            details.appendChild(ul);
            listEl.appendChild(details);
        });
    } catch (e) {
        if (log) {
            console.error(e); showToast('Erro ao carregar biblioteca.', 'error');
        }
    }
}

function destacarCapituloAtual() {
    
    const activeClasses = ["bg-primary/10", "border-primary", "shadow-[0_0_15px_rgba(139,92,246,0.15)]", "ring-1", "ring-primary/30"];
    const inactiveClasses = ["bg-zinc-800/40", "hover:bg-zinc-800", "border-zinc-700/50", "hover:border-zinc-600"];

    
    document.querySelectorAll('#libraryList li').forEach(li => {
        li.classList.remove(...activeClasses);
        li.classList.add(...inactiveClasses);
    });

    
    if (estadoAtual.obra && estadoAtual.capitulo) {
        const safeObra = estadoAtual.obra.replace(/\s+/g, '_');
        const safeCap = estadoAtual.capitulo.replace(/\./g, '-');
        const elementId = `chap-${estadoAtual.domain}-${safeObra}-${safeCap}`;
        
        const currentLi = document.getElementById(elementId);
        if (currentLi) {
            currentLi.classList.remove(...inactiveClasses);
            currentLi.classList.add(...activeClasses);
            
            
            currentLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}


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
        destacarCapituloAtual();
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
    const progressBar = document.getElementById('bulkProgressBar');
    const bulkCounter = document.getElementById('bulkCounter');

    if (!seriesUrl) return showToast("Coloque a URL da obra!", 'error');
    
    btnBulk.disabled = true;

    try {
        
        const res = await fetch(`${API_URL}/fetch-chapters`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ seriesUrl, selector: seriesSelector }) 
        });
        
        const data = await res.json();
        if (!data.success || data.links.length === 0) { 
            showToast("Nenhum capítulo encontrado.", 'error'); 
            btnBulk.disabled = false; 
            return; 
        }

        const links = data.links;
        progressArea.classList.remove('hidden');
        showToast(`Encontrados ${links.length} capítulos.`, 'success');

        
        const BATCH_SIZE = 5; 
        let processedCount = 0;

        
        for (let i = 0; i < links.length; i += BATCH_SIZE) {
            
            const chunk = links.slice(i, i + BATCH_SIZE);
            
            
            const promises = chunk.map(async (link) => {
                const { siteName, chapterName } = obterDadosDaUrl(link);
                const imgSelector = document.getElementById('selector').value; 

                try {
                    await fetch(`${API_URL}/scrape`, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ url: link, siteName, chapterName, selector: imgSelector }) 
                    });
                } catch (err) {
                    console.error(`Erro ao baixar ${chapterName}`, err);
                } finally {
                    
                    processedCount++;
                    const percent = Math.round((processedCount / links.length) * 100);
                    progressBar.style.width = `${percent}%`;
                    bulkCounter.innerText = `${processedCount}/${links.length}`;
                }
            });

            statusText.innerText = `Baixando lote ${Math.ceil((i+1)/BATCH_SIZE)}...`;
            
            
            await Promise.all(promises);
            
            
            await new Promise(r => setTimeout(r, 500));
        }

        progressBar.style.width = `100%`;
        statusText.innerText = "Concluído!";
        showToast("Processo finalizado!", 'success');
        carregarBiblioteca();
        
    } catch (e) { 
        console.error(e);
        showToast("Erro no Bulk.", 'error'); 
    } finally {
        btnBulk.disabled = false;
    }
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



function obterDadosDaUrl(url) {
    try {
        const cleanUrl = url.replace(/\/$/, '');
        const urlObj = new URL(cleanUrl);
        const segments = urlObj.pathname.split('/').filter(p => p.length > 0);
        const lastPart = segments[segments.length - 1];
        
        let siteName = '';
        let chapterName = '';

        if (segments[segments.length - 2] === 'chapter') {
            chapterName = lastPart;
            let rawName = segments[segments.length - 3];
            siteName = rawName.replace(/-[a-zA-Z0-9]+$/, '').replace(/-/g, '_');
        } else {
            const matchChapterOnly = lastPart.match(/^chapter[-_](\d+(\.\d+)?)$/i);
            if (matchChapterOnly) {
                chapterName = matchChapterOnly[1];
                const namePart = segments[segments.length - 2];
                if (namePart) siteName = namePart.replace(/-/g, '_');
            } else {
                const matchCombined = lastPart.match(/(.+)[-_]chapter[-_](\d+(\.\d+)?)/i);
                if (matchCombined) {
                    siteName = matchCombined[1].replace(/-/g, '_');
                    chapterName = matchCombined[2];
                }
            }
        }
        
        
        if (!siteName) siteName = "Obra_Desconhecida";
        if (!chapterName) chapterName = "000";

        return { siteName, chapterName };
    } catch (e) {
        return { siteName: "Erro", chapterName: "Erro" };
    }
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


function setupAtalhos() {
    document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;

    
    if (['INPUT', 'TEXTAREA'].includes(tag)) return;

    const key = e.key.toLowerCase();

    const actions = {
        arrowright: () => estadoAtual.viewMode === 'page' && mudarPagina(1),
        d: () => estadoAtual.viewMode === 'page' && mudarPagina(1),
        arrowleft: () => estadoAtual.viewMode === 'page' && mudarPagina(-1),
        a: () => estadoAtual.viewMode === 'page' && mudarPagina(-1),
        '+': () => ajustarZoom(2),
        '=': () => ajustarZoom(2),
        '-': () => ajustarZoom(-2),
        '_': () => ajustarZoom(-2),
        '0': resetarZoom,
        '/': () => {
            e.preventDefault();
            const input = document.getElementById('url');
            if (input) {
                input.focus();
                input.select();
            }
        }
    };

    if (actions[key]) {
        actions[key]();
    }
});

}