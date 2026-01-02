const API_URL = 'http://localhost:3000';
let estadoAtual = {
    domain: null,
    obra: null,
    capitulo: null,
    modo: null,
    viewMode: 'webtoon',
    pageIndex: 0,
    imagesCache: [],
    zoomLevel: 20,
    isOpen: false,
    seletoresEncontrados: {
        series: null,
        images: null,
    },
    selectionAbortController: null,
    linksCapitulosEncontrados: [],
};
let els = {
    btnActivateSelector: document.getElementById('btnActivateSelector'),
    inputSeriesUrl: document.getElementById('seriesUrl'),
    imageContainer: document.getElementById('imageContainer'),
    btnCloseBrowser: document.getElementById('btnCloseBrowser'),
    btnActivateImgSelector: document.getElementById('btnActivateImgSelector'),
    inputImgSelector: document.getElementById('imgSeriesSelector'),
    btnDisableSelection: document.getElementById('btnDisableSelection'),
    inputSeriesSelector: document.getElementById('seriesSelector'),
}
window.onload = () => {
    carregarBiblioteca(true);
    setupAtalhos();
    setup();
    // setInterval(() => { carregarBiblioteca(false); }, 20000);
};
function print(txt) {
    console.log(txt);
}
function setup() {
    // 1. Configura o botão de abrir o navegador
    if (els.btnActivateSelector) {
        els.btnActivateSelector.addEventListener('click', async function () {
            const seriesUrl = els.inputSeriesUrl.value.trim();
            if (!seriesUrl) return showToast("Coloque a URL da obra!", 'error');
            
            
            toggleView(!estadoAtual.isOpen);
            if (!estadoAtual.isOpen) return;
            els.imageContainer.innerHTML = `
                <iframe id="siteFrame" class="w-full h-full border-none bg-white opacity-0 transition-opacity duration-500" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>
            `;
            resetarInput(els.inputSeriesSelector);
            resetarInput(els.inputImgSelector);
            print(seriesUrl);
            
            carregarPaginaNoIframe(seriesUrl, 'link');
        });
    }
    // 2. Configura o botão de abrir o navegador
    if (els.btnActivateImgSelector) {
        els.btnActivateImgSelector.addEventListener('click', () => {
             
             // LÓGICA INTELIGENTE:
             // Se o usuário já selecionou capítulos no Passo 1, temos a lista salva.
             // Então, carregamos automaticamente o primeiro capítulo dessa lista.
             if (estadoAtual.linksCapitulosEncontrados && estadoAtual.linksCapitulosEncontrados.length > 0) {
                 const linkParaAbrir = estadoAtual.linksCapitulosEncontrados[0];
                 
                 showToast('Abrindo capítulo salvo para configurar imagens...', 'info');
                 
                 // Abre a janela se estiver fechada
                 toggleView(true);
                 
                 // Carrega o link e já entra no modo 'img'
                 carregarPaginaNoIframe(linkParaAbrir, 'img');
                 return;
             }
             // FALLBACK (Comportamento Antigo):
             // Se não tem links salvos, verifica se o usuário carregou algo manualmente no iframe
             const iframe = document.getElementById('siteFrame');
             if (iframe && iframe.contentWindow && iframe.classList.contains('loaded')) {
                 showToast('Modo de Seleção: IMAGENS', 'info');
                 injetarLogicaDeSelecao(iframe.contentWindow.document, 'img');
             } else {
                 showToast('Nenhum capítulo encontrado. Faça o Passo 1 primeiro!', 'error');
             }
        });
    }
    // 3. Botão Fechar Janela
    if (els.btnCloseBrowser) {
        els.btnCloseBrowser.addEventListener('click', () => toggleView(false));
    }
    // 4. Botão Desabilitar Seleção (Navegar)
    if (els.btnDisableSelection) {
        els.btnDisableSelection.addEventListener('click', () => {
            desabilitarSelecao();
            showToast('Modo Navegação Ativo', 'info');
        });
    }
}
// Função controladora da Animação de Entrada/Saída
function toggleView(forceState = null) {
    if (!els.imageContainer) return;
    const newState = forceState !== null ? forceState : !estadoAtual.isOpen;
    estadoAtual.isOpen = newState;
    const el =  els.imageContainer;
    if (estadoAtual.isOpen) {
        el.classList.remove('opacity-0', 'invisible', 'translate-y-10', 'scale-95');
        el.classList.add('opacity-100', 'visible', 'translate-y-0', 'scale-100');
    } else {
        // Ao fechar, limpa o iframe para economizar memória e resetar estado
        el.classList.remove('opacity-100', 'visible', 'translate-y-0', 'scale-100');
        el.classList.add('opacity-0', 'invisible', 'translate-y-10', 'scale-95');
        setTimeout(() => {
            el.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-zinc-700 gap-4 opacity-50">
                <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                <p class="text-sm font-light">Sua biblioteca está à esquerda.</p>
            </div>`;
        }, 300);
    }
}
function filtrarBiblioteca() {
    const termo = document.getElementById('libraryFilter').value.toLowerCase();
    const items = document.querySelectorAll('#libraryList details');
    
    items.forEach(item => {
        const title = item.getAttribute('data-name');
        if (title.includes(termo)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}
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
    els.imageContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-zinc-700 gap-4 opacity-50">
        <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
        <p class="text-sm font-light">Sua biblioteca está à esquerda.</p>
    </div>`;
    const listEl = document.getElementById('libraryList');
    
    // 1. SALVAR O ESTADO: Guarda os nomes das obras que estão abertas (details com atributo 'open')
    const obrasAbertas = new Set();
    listEl.querySelectorAll('details[open]').forEach(det => {
        const name = det.getAttribute('data-name');
        if (name) obrasAbertas.add(name);
    });
    try {
        const res = await fetch(`${API_URL}/library`);
        const library = await res.json();
        listEl.innerHTML = ''; // Limpa a lista visual
        
        if (library.length === 0) {
            listEl.innerHTML = `<div class="text-center mt-10 text-zinc-600 text-xs">Vazio.</div>`;
            return;
        }
        const selEl = document.getElementById('selector');
        if(selEl) selEl.value = "#readerarea img";
        library.forEach(obra => {
            const cleanName = obra.name.replace(/_/g, ' ');
            const dataNameValue = cleanName.toLowerCase(); // Chave para verificar se estava aberto
            
            const details = document.createElement('details');
            details.setAttribute('data-name', dataNameValue);
            
            // 2. RESTAURAR O ESTADO: Se estava aberto antes, forçamos a abrir agora
            if (obrasAbertas.has(dataNameValue)) {
                details.open = true;
            }
            details.className = "group mb-1 overflow-hidden rounded-lg border border-transparent open:border-zinc-800 open:bg-zinc-900/30 transition-all";
            
            const summary = document.createElement('summary');
            summary.className = "cursor-pointer p-2 flex items-center justify-between text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition-colors text-xs font-medium select-none";
            summary.innerHTML = `
                <div class="flex flex-col overflow-hidden">
                    <div class="flex items-center gap-2">
                        <svg class="w-3 h-3 transition-transform group-open:rotate-90 text-zinc-600 group-hover:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                        <span class="truncate capitalize" title="${cleanName}">${cleanName}</span>
                    </div>
                    <span class="text-[9px] text-zinc-600 ml-5 truncate" title="${obra.domain}">${obra.domain}</span>
                </div>
                <span class="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-px rounded ml-2">${obra.chapters.length}</span>
            `;
            // Menu de ações (Traduzir Tudo / Deletar)
            const actionsDiv = document.createElement('div');
            actionsDiv.className = "px-2 py-2 flex gap-2 border-b border-zinc-800/50 bg-black/10";
            actionsDiv.innerHTML = `
                <button onclick="traduzirObraCompleta('${obra.domain}', '${obra.name}')" class="flex-1 text-[9px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded py-1 transition flex items-center justify-center gap-1">
                    <span>✨</span> Traduzir Tudo
                </button>
                <button onclick="excluirObraInteira('${obra.domain}', '${obra.name}')" class="px-2 text-[9px] bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 rounded py-1 transition" title="Deletar Obra Inteira">
                    🗑️
                </button>
            `;
            const ul = document.createElement('ul');
            ul.className = "pt-1 pb-2 px-2 space-y-1 bg-black/20";
            
            obra.chapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            obra.chapters.forEach(cap => {
                const li = document.createElement('li');
                const safeObra = obra.name.replace(/\s+/g, '_');
                const safeCap = cap.name.replace(/\./g, '-');
                const elementId = `chap-${obra.domain}-${safeObra}-${safeCap}`;
                li.id = elementId;
                const isCurrent = estadoAtual.obra === obra.name && estadoAtual.capitulo === cap.name;
                
                // Lógica visual dos botões (baseada no sistema de Lock File do passo anterior)
                let transBtnHtml;
                if (cap.isTranslating) {
                    transBtnHtml = `<button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'translated')" class="flex-1 text-[10px] py-1 rounded transition border bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30 text-yellow-500 hover:text-yellow-300 font-semibold flex items-center justify-center gap-2 animate-pulse" title="Clique para ver o progresso"><svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Traduzindo...</button>`;
                } else if (cap.hasTranslation) {
                    transBtnHtml = `<button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'translated')" class="flex-1 text-[10px] py-1 rounded transition border bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary hover:text-white font-semibold">Ler Traduzido</button>`;
                } else {
                    transBtnHtml = `<button onclick="traduzirCapitulo(this, '${obra.domain}', '${obra.name}', '${cap.name}')" class="btn-translate flex-1 text-[10px] py-1 rounded transition border bg-zinc-900 hover:bg-primary hover:text-white border-zinc-700 text-zinc-400 font-medium flex justify-center items-center gap-1 group/trans" data-cap="${cap.name}"><span>✨</span> Traduzir</button>`;
                }
                // Estilos do item da lista
                const baseClass = "fade-in rounded p-2 flex flex-col gap-2 group/item transition-all border";
                const activeClass = "bg-primary/10 border-primary shadow-[0_0_15px_rgba(139,92,246,0.15)] ring-1 ring-primary/30";
                const inactiveClass = "bg-zinc-800/40 hover:bg-zinc-800 border-zinc-700/50 hover:border-zinc-600";
                li.className = `${baseClass} ${isCurrent ? activeClass : inactiveClass}`;
                li.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-1.5">
                            <div class="w-1 h-1 rounded-full ${cap.hasTranslation ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'}"></div>
                            <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wide group-hover/item:text-zinc-200 transition-colors">Cap. ${cap.name}</span>
                        </div>
                        <button onclick="excluirCapitulo(event, '${obra.domain}', '${obra.name}', '${cap.name}')" class="text-zinc-600 hover:text-red-400 transition opacity-0 group-hover/item:opacity-100 p-1" title="Apagar Capítulo">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                    <div class="flex gap-1.5">
                        <button onclick="abrirCapitulo('${obra.domain}', '${obra.name}', '${cap.name}', 'original')" class="flex-1 text-[10px] py-1 rounded bg-zinc-900 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition">Original</button>
                        ${transBtnHtml}
                    </div>
                `;
                ul.appendChild(li);
            });
            details.appendChild(summary);
            details.appendChild(actionsDiv);
            details.appendChild(ul);
            listEl.appendChild(details);
        });
        filtrarBiblioteca(); // Reaplica o filtro de texto se houver
    } catch (e) {
        if (log) {
            console.error(e);
            showToast('Erro ao carregar biblioteca.', 'error');
        }
    }
}
async function excluirObraInteira(domain, siteName) {
    if (!confirm(`TEM CERTEZA? Isso apagará TODOS os capítulos de "${siteName.replace(/_/g, ' ')}".`)) return;
    try {
        const res = await fetch(`${API_URL}/delete-series`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, siteName })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Obra excluída com sucesso!', 'success');
            // Se estava lendo essa obra, limpa a tela
            if (estadoAtual.obra === siteName) {
                document.getElementById('imageContainer').innerHTML = '';
                document.getElementById('currentTitle').innerText = 'Selecione uma obra';
            }
            carregarBiblioteca();
        } else {
            showToast(data.error, 'error');
        }
    } catch (e) {
        showToast('Erro ao conectar com servidor.', 'error');
    }
}
async function traduzirObraCompleta(domain, siteName) {
    // Encontra o elemento details dessa obra procurando pelo título no DOM (maneira simples)
    // Uma abordagem mais robusta seria passar o elemento, mas vamos buscar pelos botões existentes.
    
    const details = Array.from(document.querySelectorAll('details')).find(d => d.getAttribute('data-name') === siteName.replace(/_/g, ' ').toLowerCase());
    
    if (!details) return showToast('Erro ao localizar obra na lista.', 'error');
    
    // Abre a lista para o usuário ver o progresso
    details.open = true;
    // Pega todos os botões de traduzir "pendentes" (que possuem a classe btn-translate que adicionei no HTML generator)
    const pendingButtons = details.querySelectorAll('.btn-translate');
    if (pendingButtons.length === 0) {
        return showToast('Todos os capítulos já foram traduzidos!', 'success');
    }
    if (!confirm(`Deseja traduzir ${pendingButtons.length} capítulos em sequência? Isso pode demorar.`)) return;
    showToast(`Iniciando fila de tradução: ${pendingButtons.length} caps.`, 'success');
    // Processa em série (um por um) para não travar o backend/GPU
    for (let i = 0; i < pendingButtons.length; i++) {
        const btn = pendingButtons[i];
        const capName = btn.getAttribute('data-cap');
        
        // Rola até o item sendo processado
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Chama a função existente de tradução e espera ela terminar
        await traduzirCapitulo(btn, domain, siteName, capName);
        
        // Pequena pausa para respirar
        await new Promise(r => setTimeout(r, 1000));
    }
    showToast('Fila de tradução finalizada!', 'success');
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
    const cookies = obterCookiesDoIframe();
    try {
        const res = await fetch(`${API_URL}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, siteName, chapterName, selector, cookies })
        });
        const data = await res.json();
        if (data.success) { showToast('Download concluído!', 'success'); carregarBiblioteca(); } else { showToast(data.error, 'error'); }
    } catch (e) { showToast('Erro de conexão.', 'error'); }
    btn.disabled = false;
    indicator.classList.add('hidden');
}
async function traduzirCapitulo(btnElement, domain, siteName, chapterName) {
    const originalContent = btnElement.innerHTML;
    
    // Ícone de "Aguardando" (Relógio ou Spinner)
    btnElement.innerHTML = `<svg class="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    btnElement.disabled = true;
    // Verifica status da fila para dar feedback ao usuário
    try {
        const qRes = await fetch(`${API_URL}/queue-status`);
        const qData = await qRes.json();
        if (qData.running) {
            showToast(`Adicionado à fila (Posição: ${qData.length + 1})`, 'success');
            btnElement.innerHTML = `<span class="animate-pulse">⏳ Na Fila...</span>`;
        } else {
            showToast(`Iniciando tradução...`, 'success');
        }
    } catch(e) {}
    // Requisição principal (vai ficar "pendente" até o servidor processar a vez dele)
    fetch(`${API_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, siteName, chapterName, translator: 'gemini' })
    })
    .then(async (res) => {
        const data = await res.json();
        if (data.success) {
            showToast(`Capítulo ${chapterName} concluído!`, 'success');
            carregarBiblioteca();
        } else {
            showToast('Erro: ' + data.error, 'error');
            carregarBiblioteca();
        }
    })
    .catch(() => {
        showToast('Erro na conexão.', 'error');
        carregarBiblioteca();
    });
    // Recarrega em 1s para pegar o status "isTranslating" (Lock File) e virar o botão Amarelo
    setTimeout(() => { carregarBiblioteca(); }, 1500);
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
    els.imageContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-zinc-700 gap-4 opacity-50">
        <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
        <p class="text-sm font-light">Sua biblioteca está à esquerda.</p>
    </div>`;
    els.inputSeriesSelector.value = "";
    els.inputSeriesUrl.value = "";
    els.inputImgSelector.value = "";
    resetarInput(els.inputSeriesSelector);
    resetarInput(els.inputImgSelector);
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
                const imgSelector = els.inputImgSelector.value;
                const currentCookies = obterCookiesDoIframe();
                try {
                    await fetch(`${API_URL}/scrape`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: link, siteName, chapterName, selector: imgSelector, cookies: currentCookies })
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
        setTimeout(() => { progressArea.classList.add('hidden'); }, 3000);
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
async function carregarPaginaNoIframe(url, modoSelecao = 'link') {
    const iframe = document.getElementById('siteFrame');
    
    if (!iframe) {
        return;
    }
    // Fade out
    iframe.classList.add('opacity-0');
    await new Promise(r => setTimeout(r, 300));
    // Loader
    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #09090b; color: #a1a1aa; font-family: sans-serif; }
            .spinner { width: 40px; height: 40px; border: 4px solid #27272a; border-top: 4px solid #f97316; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            p { margin-top: 15px; animation: pulse 2s infinite; } @keyframes pulse { 50% { opacity: 0.5; } }
        </style>
        <div class="spinner"></div>
        <p>${modoSelecao === 'img' ? 'Abrindo capítulo para configurar imagens...' : 'Carregando lista de obras...'}</p>
    `);
    iframeDoc.close();
    iframe.classList.remove('opacity-0');
    try {
        const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxy);
        if (!res.ok) throw new Error('Erro ' + res.status);
        let html = await res.text();
        const baseTag = `<base href="${url}" target="_blank">`;
        html = html.replace('<head>', `<head>${baseTag}`)
                   .replace(/data-src=/g, 'src=')
                   .replace(/loading="lazy"/g, '');
        // CSS de Seleção (Serve para ambos)
        const selectorStyles = `
            <style>
                .selector-hover { outline: 3px solid #f97316 !important; cursor: crosshair !important; z-index: 99999; }
                .selector-selected { outline: 4px solid #ef4444 !important; background-color: rgba(239, 68, 68, 0.2) !important; }
            </style>
        `;
        html = html.replace('</head>', `${selectorStyles}</head>`);
        iframe.classList.add('opacity-0');
        setTimeout(() => {
            iframeDoc.open();
            iframeDoc.write(html);
            iframeDoc.close();
            
            iframe.classList.add('loaded'); // Marca que carregou algo real
            
            // INJETA A LÓGICA CORRETA (Link ou Img)
            injetarLogicaDeSelecao(iframeDoc, modoSelecao);
            iframe.classList.remove('opacity-0');
        }, 200);
    } catch (err) {
        showToast('Erro ao carregar página: ' + err.message, 'error');
        els.imageContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-zinc-700 gap-4 opacity-50">
                <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                <p class="text-sm font-light">Sua biblioteca está à esquerda.</p>
            </div>`;
        estadoAtual.isOpen = false;
    }
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
function injetarLogicaDeSelecao(doc, mode = 'link') {
    // 1. Limpa eventos anteriores
    desabilitarSelecao();
    // 2. Cria novo controlador
    estadoAtual.selectionAbortController = new AbortController();
    const { signal } = estadoAtual.selectionAbortController;
    // 3. Mostra botão de navegar
    if(els.btnDisableSelection) els.btnDisableSelection.classList.remove('hidden');
    let hoveredElement = null;
    let primeiroElemento = null;
    const targetSelector = mode === 'link' ? 'a[href]' : 'img';
    const inputDestino = mode === 'link' ? els.inputSeriesSelector : els.inputImgSelector;
    showToast(mode === 'link' ? 'PASSO 1: Selecione 2 Capítulos' : 'PASSO 2: Selecione 2 Imagens', 'info');
    // --- HOVER ---
    doc.addEventListener('mouseover', (e) => {
        const target = e.target.closest(targetSelector);
        if (!target) {
            if (hoveredElement) hoveredElement.classList.remove('selector-hover');
            hoveredElement = null;
            return;
        }
        if (hoveredElement && hoveredElement !== target) {
            hoveredElement.classList.remove('selector-hover');
        }
        target.classList.add('selector-hover');
        hoveredElement = target;
    }, { signal });
    // --- MOUSEOUT ---
    doc.addEventListener('mouseout', (e) => {
        const els = doc.querySelectorAll('.selector-hover');
        els.forEach(el => el.classList.remove('selector-hover'));
    }, { signal });
    // --- CLICK ---
    doc.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clickedEl = e.target.closest(targetSelector);
        if (!clickedEl) return;
        // Toggle (Desmarcar)
        if (clickedEl === primeiroElemento) {
            clickedEl.classList.remove('selector-selected');
            primeiroElemento = null;
            return;
        }
        
        // --- SELEÇÃO EM MASSA ---
        if (primeiroElemento && clickedEl !== primeiroElemento) {
            
            if (saoSimilares(primeiroElemento, clickedEl, mode)) {
                 
                 const seletor = gerarSeletorInteligente(primeiroElemento, mode);
                 
                 // Limpa visual
                 primeiroElemento.classList.remove('selector-selected');
                 clickedEl.classList.remove('selector-selected');
                 // 1. Seleciona TODOS no DOM
                 const todosSimilares = doc.querySelectorAll(seletor);
                 
                 // 2. Filtra apenas os válidos (Essa é a parte que resolve seu problema)
                 const elementosValidos = Array.from(todosSimilares).filter(el => {
                     if (mode === 'link') {
                         // Verifica se é link E se o href não é vazio, # ou javascript:
                         const href = el.getAttribute('href');
                         return el.tagName === 'A' && href &&
                                href.trim() !== '' &&
                                href.trim() !== '#' &&
                                !href.toLowerCase().startsWith('javascript:');
                     }
                     if (mode === 'img') return el.tagName === 'IMG' && el.src;
                     return false;
                 });
                 // Aplica visual (borda vermelha) nos válidos
                 elementosValidos.forEach(el => el.classList.add('selector-selected'));
                 // 3. Salva no estado
                 if (mode === 'link') {
                     estadoAtual.seletoresEncontrados.series = seletor;
                     // Salva apenas os URLs limpos
                     estadoAtual.linksCapitulosEncontrados = elementosValidos.map(el => el.href);
                 } else {
                     estadoAtual.seletoresEncontrados.images = seletor;
                 }
                 // Atualiza Input
                 if(inputDestino) {
                     inputDestino.value = seletor;
                     marcarInputComoSucesso(inputDestino);
                 }
                 
                 showToast(`Sucesso! ${elementosValidos.length} itens válidos encontrados.`, 'success');
                 // 4. Automação Inteligente (Pula o capítulo vazio)
                 if (mode === 'link' && elementosValidos.length > 0) {
                     
                     // Como filtramos os links inválidos (como o 82 vazio),
                     // 'elementosValidos[0]' será o primeiro link QUE FUNCIONA (ex: 81).
                     // Nota: Dependendo da ordem do site, pode ser o [0] ou o último.
                     // Geralmente listas vêm topo->baixo (novo->velho). Então pegamos o [0].
                     
                     const linkParaAbrir = elementosValidos[0].href;
                     
                     if (linkParaAbrir) {
                         showToast('Carregando capítulo para configurar imagens...', 'success');
                         // Remove eventos antes de carregar
                         desabilitarSelecao();
                         
                         setTimeout(() => {
                             carregarPaginaNoIframe(linkParaAbrir, 'img');
                         }, 1000);
                     }
                 } else if (mode === 'img') {
                    showToast("Configuração Concluída!", 'success');
                    desabilitarSelecao();
                 }
                 
                 primeiroElemento = null;
             } else {
                 // Seleção diferente (reset)
                 primeiroElemento.classList.remove('selector-selected');
                 clickedEl.classList.add('selector-selected');
                 primeiroElemento = clickedEl;
                 
                 const seletor = gerarSeletorInteligente(clickedEl, mode);
                 if(inputDestino) inputDestino.value = seletor;
             }
     
        
         } else {
             // Primeiro Clique
             clickedEl.classList.add('selector-selected');
             primeiroElemento = clickedEl;
             
             const seletor = gerarSeletorInteligente(clickedEl, mode);
             if (inputDestino) inputDestino.value = seletor;
             marcarInputComoSucesso(inputDestino);
         }
        
    }, { signal, capture: true });
}
function desabilitarSelecao() {
    // 1. Aciona o sinal de Abortar (remove todos os EventListeners associados)
    if (estadoAtual.selectionAbortController) {
        estadoAtual.selectionAbortController.abort();
        estadoAtual.selectionAbortController = null;
    }
    // 2. Limpa visualmente o hover (borda laranja) que possa ter ficado
    const iframe = document.getElementById('siteFrame');
    if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
        const doc = iframe.contentWindow.document;
        const hovers = doc.querySelectorAll('.selector-hover');
        hovers.forEach(el => el.classList.remove('selector-hover'));
        
        // Opcional: Se quiser limpar os selecionados (vermelho) também, descomente abaixo:
        // const selecteds = doc.querySelectorAll('.selector-selected');
        // selecteds.forEach(el => el.classList.remove('selector-selected'));
    }
    // 3. Esconde o botão de desabilitar
    if(els.btnDisableSelection) els.btnDisableSelection.classList.add('hidden');
}
function marcarInputComoSucesso(inputEl) {
    // Remove bordas padrão/neutras
    inputEl.classList.remove('border-zinc-700/50', 'focus:border-primary', 'focus:ring-primary/50');
    
    // Adiciona o tema VERDE (Sucesso)
    inputEl.classList.add(
        'border-green-500',
        'text-green-400',
        'bg-green-500/10',
        'ring-1',
        'rounded-md',
        'ring-green-500',
        'font-bold' // Opcional: deixa o texto mais forte
    );
    
    // Opcional: Adiciona um ícone ou brilho extra
    inputEl.parentElement.classList.add('animate-pulse');
    setTimeout(() => inputEl.parentElement.classList.remove('animate-pulse'), 500);
}
function resetarInput(inputEl) {
    // Remove o tema verde
    inputEl.classList.remove(
        'border-green-500',
        'text-green-400',
        'bg-green-500/10',
        'ring-1',
        'ring-green-500',
        'font-bold'
    );
    
    // Volta ao padrão
    inputEl.classList.add('border-zinc-700/50');
}
function saoSimilares(el1, el2, mode) {
    if (el1.tagName !== el2.tagName) return false;
    
    const getClasses = (el) => Array.from(el.classList)
        .filter(c => !c.startsWith('selector-'))
        .sort().join(' ');
        
    const classes1 = getClasses(el1);
    const classes2 = getClasses(el2);
    if (classes1 === classes2 && classes1 !== '') return true;
    if (el1.parentElement.tagName === el2.parentElement.tagName &&
        el1.parentElement.className === el2.parentElement.className) {
        return true;
    }
    return false;
}
function gerarSeletorInteligente(el, mode) {
    const tag = mode === 'link' ? 'a' : 'img';
    // 1. PRIORIDADE MÁXIMA: Buscar um pai com ID (Ex: #readerarea, #chapterlist)
    // Isso evita classes sujas como "curdown", "active", "lazyloaded"
    const parentWithId = el.closest('[id]');
    
    if (parentWithId) {
        const id = parentWithId.id;
        // Ignora IDs do nosso próprio sistema ou IDs vazios
        if (id && id !== 'siteFrame' && !id.startsWith('loading')) {
            // Verifica se o ID é único o suficiente (não é um ID gerado aleatoriamente cheio de números)
            if (!/\d{5,}/.test(id)) {
                return `#${id} ${tag}`;
            }
        }
    }
    // 2. Se não achar pai com ID, tenta classes do próprio elemento
    // Filtramos classes comuns de estado que atrapalham (active, open, lazy, etc)
    const badClasses = ['active', 'current', 'open', 'loading', 'lazy', 'lazyload', 'curdown', 'loaded', 'selected'];
    
    let classes = Array.from(el.classList)
        .filter(c => !c.startsWith('selector-') && !badClasses.some(bad => c.includes(bad)))
        .join('.');
    
    if (classes) {
        return `${tag}.${classes}`;
    }
    // 3. Se o elemento não tem classe boa, tenta a classe do Pai
    if (el.parentElement) {
        let parentClasses = Array.from(el.parentElement.classList)
            .filter(c => !c.startsWith('selector-') && !badClasses.some(bad => c.includes(bad)))
            .join('.');
        
        if (parentClasses) {
            return `.${parentClasses} ${tag}`;
        }
    }
    // 4. Fallback: Retorna só a tag (arriscado, mas melhor que nada)
    return tag;
}
function obterCookiesDoIframe() {
    const iframe = document.getElementById('siteFrame');
    try {
        // Tenta pegar os cookies do documento dentro do iframe
        if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
            return iframe.contentWindow.document.cookie || "";
        }
    } catch (e) {
        console.warn("Não foi possível ler cookies do iframe (Bloqueio de segurança ou Cross-Origin).");
    }
    return "";
}