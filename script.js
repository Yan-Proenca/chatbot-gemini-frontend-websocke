/* ============================================================
   SISTEMA DE DEFESA NACIONAL — script.js
   Comunicação Socket.IO com app.py (Flask-SocketIO)
   ============================================================ */

const URL_BACKEND = 'https://chatbot-steam-backend.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    let socket = null;

    // --- Referências ao DOM ---
    const chatBox        = document.getElementById('chat-box');
    const messageInput   = document.getElementById('message-input');
    const sendButton     = document.getElementById('send-button');
    const iniciarBtn     = document.getElementById('iniciarBtn');
    const encerrarBtn    = document.getElementById('encerrarBtn');
    const limparBtn      = document.getElementById('limparBtn');

    // Indicadores de status
    const statusDot      = document.getElementById('status-dot');    // painel esquerdo
    const statusLabel    = document.getElementById('status-label');
    const connDot        = document.getElementById('conn-dot');       // header do chat
    const connText       = document.getElementById('conn-text');

    let userSessionId    = null;

    // ============================================================
    // GERENCIAMENTO DE STATUS
    // ============================================================
    const STATUS = {
        idle: {
            label: 'AGUARDANDO INÍCIO',
            conn:  'DESCONECTADO',
            dot:   '',
        },
        connecting: {
            label: 'ESTABELECENDO LINK...',
            conn:  'CONECTANDO...',
            dot:   '',
        },
        connected: {
            label: 'OPERAÇÃO ATIVA',
            conn:  'EM OPERAÇÃO',
            dot:   'on',
        },
        disconnected: {
            label: 'SINAL PERDIDO',
            conn:  'DESCONECTADO',
            dot:   'off',
        },
    };

    function setStatus(state) {
        const cfg = STATUS[state] ?? STATUS.idle;

        statusLabel.textContent = cfg.label;
        connText.textContent    = cfg.conn;

        // Remove todas as classes de estado antes de aplicar a nova
        statusDot.className = 'status-dot' + (cfg.dot ? ` ${cfg.dot}` : '');
        connDot.className   = 'conn-dot'   + (cfg.dot ? ` ${cfg.dot}` : '');
    }

    // ============================================================
    // ADICIONAR MENSAGEM AO CHAT
    // ============================================================
    function addMessage(sender, text, type = 'normal') {
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
                displayName = 'ASSISTENTE IA';
                break;
            default:
                el.classList.add('status-message');
                displayName = type === 'error' ? 'FALHA OPERACIONAL' : 'SISTEMA';
        }

        if (type === 'error') el.classList.add('error-text');

        // Rótulo do remetente
        const label = document.createElement('strong');
        label.textContent = displayName;
        el.appendChild(label);

        // Conteúdo da mensagem
        const content = document.createElement('span');
        if (type === 'normal') {
            // Renderiza Markdown para mensagens de usuário e bot
            content.innerHTML = marked.parse(text);
        } else {
            content.textContent = text;
        }
        el.appendChild(content);

        chatBox.appendChild(el);

        // Scroll automático para a última mensagem
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ============================================================
    // HABILITAR / DESABILITAR INPUT
    // ============================================================
    function setChatEnabled(enabled) {
        messageInput.disabled = !enabled;
        sendButton.disabled   = !enabled;
    }

    // Estado inicial
    setChatEnabled(false);
    setStatus('idle');
    addMessage('sistema', 'Sistema aguardando inicialização. Clique em "Iniciar Operação" para estabelecer conexão segura.', 'status');

    // ============================================================
    // CONECTAR AO SERVIDOR (Flask-SocketIO em app.py)
    // ============================================================
    function iniciarOperacao() {
        // Evita múltiplas conexões simultâneas
        if (socket && socket.connected) return;

        setStatus('connecting');
        addMessage('sistema', 'Estabelecendo link criptografado com o servidor...', 'status');

        socket = io(URL_BACKEND, {
            transports: ['websocket'],
            withCredentials: true,
        });

        // --- Eventos do Socket.IO ---

        socket.on('connect', () => {
            console.log('[SOCKET] Conectado — SID:', socket.id);
            setStatus('connected');
            addMessage('sistema', 'Canal seguro estabelecido. Sistema operacional.', 'status');
            setChatEnabled(true);
        });

        socket.on('disconnect', () => {
            console.log('[SOCKET] Desconectado do servidor.');
            setStatus('disconnected');
            addMessage('sistema', 'Conexão encerrada com o servidor.', 'status');
            setChatEnabled(false);
        });

        // Recebe o session_id do app.py (evento status_conexao)
        socket.on('status_conexao', (data) => {
            if (data.session_id) {
                userSessionId = data.session_id;
                console.log('[SESSION] ID de sessão:', userSessionId);
            }
        });

        // Recebe resposta do bot (evento nova_mensagem emitido pelo app.py)
        socket.on('nova_mensagem', (data) => {
            addMessage(data.remetente, data.texto, 'normal');
        });

        // Recebe erros do servidor (evento erro emitido pelo app.py)
        socket.on('erro', (data) => {
            addMessage('sistema', data.erro, 'error');
        });
    }

    // ============================================================
    // ENCERRAR CONEXÃO
    // ============================================================
    function encerrarOperacao() {
        if (socket && socket.connected) {
            socket.disconnect();
            setChatEnabled(false);
            setStatus('disconnected');
            addMessage('sistema', 'Missão encerrada pelo operador. Canal fechado.', 'status');
        }
    }

    // ============================================================
    // LIMPAR REGISTROS DO CHAT
    // ============================================================
    function limparRegistros() {
        chatBox.innerHTML = '';
        addMessage('sistema', 'Registros de sessão removidos da interface local.', 'status');
    }

    // ============================================================
    // ENVIAR MENSAGEM → app.py (evento enviar_mensagem)
    // ============================================================
    function enviarMensagem() {
        const texto = messageInput.value.trim();
        if (!texto) return;

        if (socket && socket.connected) {
            addMessage('user', texto, 'normal');
            socket.emit('enviar_mensagem', { mensagem: texto });
            messageInput.value = '';
            messageInput.focus();
        } else {
            addMessage('sistema', 'Sem conexão ativa. Inicie a operação primeiro.', 'error');
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
});
