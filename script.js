/* ============================================================
   SISTEMA DE DEFESA NACIONAL — script.js  v3.0
   Painel Tático Dinâmico | Flask-SocketIO ↔ Gemini
   ============================================================ */

const URL_BACKEND = 'https://chatbot-steam-backend.onrender.com';

document.addEventListener('DOMContentLoaded', () => {

    let socket = null;
    let typingEl = null;    // elemento de "digitando..."
    let isWaiting = false;  // aguardando resposta do bot

    // ── Referências ao DOM ──────────────────────────────────
    const chatBox       = document.getElementById('chat-box');
    const messageInput  = document.getElementById('message-input');
    const sendButton    = document.getElementById('send-button');
    const iniciarBtn    = document.getElementById('iniciarBtn');
    const encerrarBtn   = document.getElementById('encerrarBtn');
    const limparBtn     = document.getElementById('limparBtn');

    const statusDot     = document.getElementById('status-dot');
    const statusLabel   = document.getElementById('status-label');
    const connDot       = document.getElementById('conn-dot');
    const connText      = document.getElementById('conn-text');

    const ctxForca      = document.getElementById('ctx-forca');
    const ctxVetor      = document.getElementById('ctx-vetor');
    const ctxExtensao   = document.getElementById('ctx-extensao');
    const avatarFrame   = document.getElementById('avatar-frame');
    const avatarForcaLabel = document.getElementById('avatar-forca-label');

    let userSessionId = null;

    // ============================================================
    // ESTADO DOS FILTROS (padrões iniciais = botões marcados active no HTML)
    // ============================================================
    const filters = {
        forca:    'BOPE',
        vetor:    'Estratégias Táticas',
        conduta:  'Formal',
        extensao: 'Resumo Direto',
    };

    // Mapeamento Força → classe CSS do tema
    const FORCE_THEME = {
        'BOPE':        'force-police',
        'PM':          'force-police',
        'PC':          'force-police',
        'PF':          'force-federal',
        'PRF':         'force-federal',
        'Exército':    'force-army',
        'Aeronáutica': 'force-air',
        'Marinha':     'force-naval',
    };

    // Cor do texto para cada força no header
    const FORCE_COLOR = {
        'BOPE':        'var(--green-light)',
        'PM':          'var(--green-light)',
        'PC':          'var(--green-light)',
        'PF':          'var(--brass-bright)',
        'PRF':         'var(--brass-bright)',
        'Exército':    '#a0cc78',
        'Aeronáutica': '#82b8f8',
        'Marinha':     '#82b8f8',
    };

    // Legenda curta para Extensão no header
    const EXTENSAO_SHORT = {
        'Resumo Direto':       'BREVE',
        'Padrão Operacional':  'PADRÃO',
        'Relatório Completo':  'COMPLETO',
    };

    // Legenda curta para Vetor no header
    const VETOR_SHORT = {
        'Estratégias Táticas': 'TÁTICAS',
        'Concurso Público':    'CONCURSO',
        'Requisitos Mínimos':  'REQUIS.',
        'Operações':           'OPS',
        'Cargos':              'CARGOS',
        'Rotina':              'ROTINA',
    };

    // ============================================================
    // STATUS MANAGEMENT
    // ============================================================
    const STATUS_CFG = {
        idle:        { label: 'AGUARDANDO INÍCIO', conn: 'DESCONECTADO', dot: '' },
        connecting:  { label: 'ESTABELECENDO LINK...', conn: 'CONECTANDO...', dot: '' },
        connected:   { label: 'OPERAÇÃO ATIVA',    conn: 'EM OPERAÇÃO',  dot: 'on' },
        disconnected:{ label: 'SINAL PERDIDO',     conn: 'DESCONECTADO', dot: 'off' },
    };

    function setStatus(state) {
        const cfg = STATUS_CFG[state] ?? STATUS_CFG.idle;
        statusLabel.textContent = cfg.label;
        connText.textContent    = cfg.conn;

        statusDot.className = 'status-dot' + (cfg.dot ? ` ${cfg.dot}` : '');
        connDot.className   = 'conn-dot'   + (cfg.dot ? ` ${cfg.dot}` : '');
    }

    // ============================================================
    // HABILITAR / DESABILITAR INPUT
    // ============================================================
    function setChatEnabled(enabled) {
        const on = enabled && !isWaiting;
        messageInput.disabled = !on;
        sendButton.disabled   = !on;
    }

    // Bloqueia input enquanto aguarda resposta
    function setWaiting(waiting) {
        isWaiting = waiting;
        if (socket?.connected) setChatEnabled(!waiting);
    }

    // ============================================================
    // FILTROS — INTERAÇÃO
    // ============================================================
    function initFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.dataset.group;
                const value = btn.dataset.value;

                // Atualiza estado
                filters[group] = value;

                // Toggle classe active no grupo
                document.querySelectorAll(`.filter-btn[data-group="${group}"]`)
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Atualiza HUD e avatar
                syncContextDisplay();
                if (group === 'forca') syncAvatarTheme();
            });
        });

        // Toggle colapsável (mobile)
        const toggle = document.getElementById('paramsToggle');
        const body   = document.getElementById('paramsBody');
        if (toggle && body) {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', String(!expanded));
                body.classList.toggle('params-collapsed');
                const icon = toggle.querySelector('svg');
                if (icon) icon.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
            });
        }
    }

    function syncContextDisplay() {
        if (ctxForca) {
            ctxForca.textContent = filters.forca;
            ctxForca.style.color = FORCE_COLOR[filters.forca] ?? 'var(--green-light)';
        }
        if (ctxVetor) {
            ctxVetor.textContent = VETOR_SHORT[filters.vetor] ?? filters.vetor;
        }
        if (ctxExtensao) {
            ctxExtensao.textContent = EXTENSAO_SHORT[filters.extensao] ?? filters.extensao;
        }
    }

    function syncAvatarTheme() {
        if (!avatarFrame) return;

        // Remove temas anteriores
        const themes = ['force-police','force-federal','force-army','force-air','force-naval'];
        avatarFrame.classList.remove(...themes);

        const theme = FORCE_THEME[filters.forca];
        if (theme) avatarFrame.classList.add(theme);

        if (avatarForcaLabel) {
            avatarForcaLabel.textContent = `▸ ${filters.forca} — ATIVO`;
        }
    }

    // ============================================================
    // ADICIONAR MENSAGEM AO CHAT
    // ============================================================
    function addMessage(sender, text, type = 'normal', forceClass = null) {
        const el = document.createElement('div');
        el.classList.add('message');

        let displayName;

        switch (sender.toLowerCase()) {
            case 'user':
                el.classList.add('user-message');
                displayName = 'OPERADOR';
                break;

            case 'bot':
                el.classList.add('bot-message');
                if (forceClass) el.classList.add(forceClass);
                displayName = `ASSISTENTE IA · ${filters.forca}`;
                break;

            default:
                el.classList.add('status-message');
                displayName = type === 'error' ? 'FALHA OPERACIONAL' : 'SISTEMA';
        }

        if (type === 'error') el.classList.add('error-text');

        // Rótulo
        const label = document.createElement('strong');
        label.textContent = displayName;
        el.appendChild(label);

        // Conteúdo
        const content = document.createElement('span');
        if (type === 'normal') {
            content.innerHTML = marked.parse(text);
        } else {
            content.textContent = text;
        }
        el.appendChild(content);

        chatBox.appendChild(el);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ── Indicador de "digitando..." ────────────────────────────
    function showTyping() {
        removeTyping();
        typingEl = document.createElement('div');
        typingEl.classList.add('typing-indicator');
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.classList.add('typing-dot');
            typingEl.appendChild(dot);
        }
        chatBox.appendChild(typingEl);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function removeTyping() {
        if (typingEl) {
            typingEl.remove();
            typingEl = null;
        }
    }

    // ============================================================
    // CONEXÃO AO SERVIDOR (Flask-SocketIO / app.py)
    // ============================================================
    function iniciarOperacao() {
        if (socket && socket.connected) return;

        setStatus('connecting');
        addMessage('sistema', 'Estabelecendo canal criptografado com o servidor...', 'status');

        socket = io(URL_BACKEND, {
            transports: ['websocket'],
            withCredentials: true,
        });

        // ── Eventos ────────────────────────────────────────────

        socket.on('connect', () => {
            console.log('[SOCKET] Conectado — SID:', socket.id);
            setStatus('connected');
            addMessage('sistema', 'Canal seguro estabelecido. Sistema operacional.', 'status');
            setChatEnabled(true);
        });

        socket.on('disconnect', () => {
            console.log('[SOCKET] Desconectado.');
            setStatus('disconnected');
            removeTyping();
            setWaiting(false);
            addMessage('sistema', 'Conexão encerrada com o servidor.', 'status');
            setChatEnabled(false);
        });

        // Recebe session_id do app.py (evento status_conexao)
        socket.on('status_conexao', (data) => {
            if (data.session_id) {
                userSessionId = data.session_id;
                console.log('[SESSION] ID:', userSessionId);
            }
        });

        // Recebe resposta do bot (evento nova_mensagem do app.py)
        socket.on('nova_mensagem', (data) => {
            removeTyping();
            setWaiting(false);

            // Usa a forca retornada pelo backend para tematizar a bolha
            const fc = data.forca ? (FORCE_THEME[data.forca] ?? null) : null;
            addMessage(data.remetente, data.texto, 'normal', fc);
        });

        // Recebe erros do servidor (evento erro do app.py)
        socket.on('erro', (data) => {
            removeTyping();
            setWaiting(false);
            addMessage('sistema', data.erro, 'error');
        });
    }

    // ============================================================
    // ENCERRAR OPERAÇÃO
    // ============================================================
    function encerrarOperacao() {
        if (socket && socket.connected) {
            socket.disconnect();
            setChatEnabled(false);
            setStatus('disconnected');
            removeTyping();
            setWaiting(false);
            addMessage('sistema', 'Missão encerrada pelo operador. Canal fechado.', 'status');
        }
    }

    // ============================================================
    // LIMPAR REGISTROS
    // ============================================================
    function limparRegistros() {
        chatBox.innerHTML = '';
        addMessage('sistema', 'Registros de sessão removidos da interface local.', 'status');
    }

    // ============================================================
    // ENVIAR MENSAGEM → app.py (evento enviar_mensagem)
    // Payload inclui todos os filtros selecionados
    // ============================================================
    function enviarMensagem() {
        const texto = messageInput.value.trim();
        if (!texto || isWaiting) return;

        if (socket && socket.connected) {
            addMessage('user', texto, 'normal');

            // Payload completo com filtros
            socket.emit('enviar_mensagem', {
                mensagem: texto,
                forca:    filters.forca,
                vetor:    filters.vetor,
                conduta:  filters.conduta,
                extensao: filters.extensao,
            });

            messageInput.value = '';
            messageInput.focus();

            // Bloqueia input e exibe indicador de digitação
            setWaiting(true);
            showTyping();

        } else {
            addMessage('sistema', 'Sem conexão ativa. Clique em "Iniciar Operação" primeiro.', 'error');
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    iniciarBtn.addEventListener('click',  iniciarOperacao);
    encerrarBtn.addEventListener('click', encerrarOperacao);
    limparBtn.addEventListener('click',   limparRegistros);
    sendButton.addEventListener('click',  enviarMensagem);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            enviarMensagem();
        }
    });

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    initFilters();
    syncContextDisplay();
    syncAvatarTheme();
    setChatEnabled(false);
    setStatus('idle');
    addMessage(
        'sistema',
        'Sistema aguardando inicialização. Configure os parâmetros de missão e clique em "Iniciar Operação".',
        'status'
    );

});