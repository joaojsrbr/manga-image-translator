// script.js
const API_URL = 'http://localhost:3000';
let estadoAtual = { obra: null, capitulo: null, modo: null };

window.onload = () => { carregarBiblioteca(); setupAtalhos(); };

// ... (FUNÇÃO carregarBiblioteca MANTIDA IGUAL) ...
async function carregarBiblioteca() {
    const listEl = document.getElementById('libraryList');
    try {
        const res = await fetch(`${API_URL}/library`);
        const library = await res.json();
        listEl.innerHTML = '';
        if (library.length === 0) { listEl.innerHTML = `<div class="text-center mt-10 text-zinc-600 text-xs">Vazio.</div>`; return; }

        library.forEach(obra => {
            const cleanName = obra.name.replace(/_/g, ' ');
            const details = document.createElement('details');
            details.className = "group mb-1 overflow-hidden rounded-lg border border-transparent open:border-zinc-800 open:bg-zinc-900/30 transition-all";
            
            const summary = document.createElement('summary');
            summary.className = "cursor-pointer p-2 flex items-center justify-between text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition-colors text-xs font-medium select-none";
            summary.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden">
                    <svg class="w-3 h-3 transition-transform group-open:rotate-90 text-zinc-600 group-hover:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                    <span class="truncate capitalize" title="${cleanName}">${cleanName}</span>
                </div>
                <span class="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-px rounded">${obra.chapters.length}</span>
            `;

            const ul = document.createElement('ul');
            ul.className = "pt-1 pb-2 px-2 space-y-1 bg-black/20";

            obra.chapters.forEach(cap => {
                const li = document.createElement('li');
                li.className = "fade-in bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 rounded p-2 flex flex-col gap-2 group/item transition-all";

                let transBtnHtml = '';
                if (cap.hasTranslation) {
                    transBtnHtml = `<button onclick="abrirCapitulo('${obra.name}', '${cap.name}', 'translated')" class="flex-1 text-[10px] py-1 rounded transition border bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary hover:text-white font-semibold">Ler Traduzido</button>`;
                } else {
                    transBtnHtml = `<button id="btn-trans-${obra.name}-${cap.name}" onclick="traduzirCapitulo(this, '${obra.name}', '${cap.name}')" class="flex-1 text-[10px] py-1 rounded transition border bg-zinc-900 hover:bg-primary hover:text-white border-zinc-700 text-zinc-400 font-medium flex justify-center items-center gap-1 group/trans"><span>✨</span> Traduzir</button>`;
                }

                li.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-1.5">
                            <div class="w-1 h-1 rounded-full ${cap.hasTranslation ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'}"></div>
                            <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Cap. ${cap.name}</span>
                        </div>
                        <button onclick="excluirCapitulo(event, '${obra.name}', '${cap.name}')" class="text-zinc-600 hover:text-red-400 transition opacity-0 group-hover/item:opacity-100 p-1" title="Apagar"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </div>
                    <div class="flex gap-1.5">
                        <button onclick="abrirCapitulo('${obra.name}', '${cap.name}', 'original')" class="flex-1 text-[10px] py-1 rounded bg-zinc-900 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition">Original</button>
                        ${transBtnHtml}
                    </div>
                `;
                ul.appendChild(li);
            });
            details.appendChild(summary);
            details.appendChild(ul);
            listEl.appendChild(details);
        });
    } catch (e) { console.error(e); showToast('Erro ao carregar biblioteca.', 'error'); }
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
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    indicator.classList.remove('hidden');

    try {
        const res = await fetch(`${API_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, siteName, chapterName, selector })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Download concluído!', 'success');
            carregarBiblioteca();
        } else { showToast(data.error, 'error'); }
    } catch (e) { showToast('Erro de conexão.', 'error'); }

    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    indicator.classList.add('hidden');
}

// --- FUNÇÃO DE TRADUÇÃO ATUALIZADA ---
async function traduzirCapitulo(btnElement, siteName, chapterName) {
    const originalText = btnElement.innerHTML;
    
    // PEGA O VALOR DO MOTOR DE TRADUÇÃO DO INPUT
    const translatorEngine = document.getElementById('translatorType').value || 'gemini';

    btnElement.disabled = true;
    btnElement.innerHTML = `<svg class="animate-spin h-3 w-3 text-white mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Traduzindo...`;
    btnElement.className = "flex-1 text-[10px] py-1 rounded transition border bg-primary/20 border-primary/50 text-primary font-bold flex justify-center items-center cursor-wait";

    showToast(`Iniciando tradução (Motor: ${translatorEngine})...`, 'success');

    try {
        const res = await fetch(`${API_URL}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                siteName, 
                chapterName, 
                translator: translatorEngine // Envia o motor escolhido
            })
        });
        const data = await res.json();

        if (data.success) {
            showToast('Tradução finalizada!', 'success');
            carregarBiblioteca();
        } else {
            showToast('Erro: ' + data.error, 'error');
            btnElement.innerHTML = "Erro";
            setTimeout(() => { btnElement.innerHTML = originalText; btnElement.disabled = false; }, 2000);
        }
    } catch (e) {
        showToast('Erro de conexão.', 'error');
        btnElement.disabled = false;
        btnElement.innerHTML = originalText;
    }
}

// ... (RESTO DAS FUNÇÕES: excluirCapitulo, abrirCapitulo, autoPreencher, showToast, setupAtalhos MANTIDAS IGUAIS) ...

async function excluirCapitulo(event, siteName, chapterName) {
    event.stopPropagation();
    if(!confirm(`Apagar Capítulo ${chapterName}?`)) return;
    try {
        const res = await fetch(`${API_URL}/delete-chapter`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteName, chapterName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Capítulo removido', 'success');
            carregarBiblioteca();
            if (estadoAtual.obra === siteName && estadoAtual.capitulo === chapterName) {
                document.getElementById('imageContainer').innerHTML = '';
                document.getElementById('currentTitle').innerText = 'Selecione uma obra';
                document.getElementById('currentStatus').innerHTML = '';
            }
        } else { showToast('Erro: ' + data.error, 'error'); }
    } catch (e) { showToast('Erro ao apagar', 'error'); }
}

async function abrirCapitulo(obra, capitulo, modo) {
    estadoAtual = { obra, capitulo, modo };
    document.getElementById('currentTitle').innerText = `${obra.replace(/_/g, ' ')} / Cap. ${capitulo}`;
    const statusDiv = document.getElementById('currentStatus');
    if(modo === 'translated') { statusDiv.innerHTML = `<span class="text-[10px] text-green-400 font-medium flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Traduzido (PT-BR)</span>`; } 
    else { statusDiv.innerHTML = `<span class="text-[10px] text-zinc-400 font-medium flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-zinc-500"></span> Original</span>`; }

    const container = document.getElementById('imageContainer');
    container.innerHTML = `<div class="h-full flex flex-col items-center justify-center gap-3"><div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div><span class="text-xs text-zinc-500 animate-pulse">Carregando páginas...</span></div>`;

    try {
        const res = await fetch(`${API_URL}/get-images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteName: obra, chapterName: capitulo, type: modo })
        });
        const data = await res.json();
        container.innerHTML = '';
        if (!data.success) { container.innerHTML = `<div class="mt-20 text-center text-zinc-500 text-xs">Imagens não encontradas.</div>`; return; }
        const folderName = modo === 'translated' ? 'traduzido' : 'original';
        data.images.forEach(imgName => {
            const img = document.createElement('img');
            img.src = `/arquivos/${obra}/${capitulo}/${folderName}/${imgName}`;
            img.className = "max-w-full md:max-w-2xl mx-auto shadow-2xl mb-1 rounded-sm";
            img.loading = "lazy";
            container.appendChild(img);
        });
    } catch (e) { container.innerHTML = '<p class="text-red-500 mt-10 text-center">Erro ao carregar imagens.</p>'; }
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
    } catch (e) { console.log("URL não reconhecida."); }
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
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            document.getElementById('url').focus();
        }
    });
}