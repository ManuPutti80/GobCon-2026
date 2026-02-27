import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { 
  X, Users, MapPin, LogOut, Trash2, Search, Calendar, 
  HelpCircle, Box, Clock, CheckCircle, MessageCircle, 
  Send, ExternalLink, Filter, Edit, Package, UserPlus, 
  Lock, Unlock, MessagesSquare, AlertTriangle, Maximize, Minimize, Share2, UserCog 
} from 'lucide-react'
import logoTdG from './assets/logo.png' 
import { TOP_GAMES } from './assets/gamesList.js'

function App() {
  // --- STATI PRINCIPALI ---
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('bg_user') || '')
  const [matches, setMatches] = useState([])
  
  // Stati Modali & UI
  const [isModalOpen, setIsModalOpen] = useState(false) 
  const [isChatOpen, setIsChatOpen] = useState(false)   
  const [modalMode, setModalMode] = useState('OFFER') 
  const [editingMatch, setEditingMatch] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false) 

  // Filtri
  const [searchTerm, setSearchTerm] = useState('')
  const [showMyMatchesOnly, setShowMyMatchesOnly] = useState(false)
  const [filterType, setFilterType] = useState('ALL') 

  // Dati Form
  const [gameName, setGameName] = useState('')
  const [tableNr, setTableNr] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [notes, setNotes] = useState('')
  const [whenTime, setWhenTime] = useState('')
  const [targetSortDate, setTargetSortDate] = useState(null) 
  
  const [suggestions, setSuggestions] = useState([])
  const [dynamicTimeOptions, setDynamicTimeOptions] = useState([])

  // Chat & Fullscreen
  const [currentChatMatch, setCurrentChatMatch] = useState(null)
  const [chatMessages, setChatMessages] = useState([])           
  const [newMessage, setNewMessage] = useState('')               
  const [isFullscreen, setIsFullscreen] = useState(false)
  const messagesEndRef = useRef(null)                            

  // --- LOGICA NOTIFICHE ---
  const sendBrowserNotification = (title, body) => {
      if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, { body: body, icon: logoTdG, silent: false });
      }
  }

  // --- EFFETTI ---
  useEffect(() => {
    fetchMatches().then(() => cleanupExpiredChats());

    const globalChannel = supabase.channel('global_events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        fetchMatches(); 
        const newMatch = payload.new;
        if (newMatch.host_name !== localStorage.getItem('bg_user')) {
            let title = "🎲 Nuovo Tavolo";
            if (newMatch.match_type === 'REQUEST') title = "❓ Nuova Richiesta";
            if (newMatch.match_type === 'GENERIC') title = "💬 Nuova Chat Genere";
            sendBrowserNotification(title, `${newMatch.host_name}: ${newMatch.game_name} (${newMatch.match_time})`);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { fetchMatches() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const newMsg = payload.new;
          const myName = localStorage.getItem('bg_user');
          if (newMsg.user_name === myName) return;
          const { data: matchData } = await supabase.from('matches').select('players_list, game_name').eq('id', newMsg.match_id).single();
          if (matchData && matchData.players_list.includes(myName)) {
              sendBrowserNotification(`💬 ${matchData.game_name}`, `${newMsg.user_name}: ${newMsg.content}`);
          }
      })
      .subscribe()

    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => { 
        supabase.removeChannel(globalChannel);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }
  }, [])

  useEffect(() => {
    let chatChannel = null;
    if (isChatOpen && currentChatMatch) {
        fetchMessages(currentChatMatch.id);
        chatChannel = supabase.channel(`chat_${currentChatMatch.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${currentChatMatch.id}` }, 
            (payload) => setChatMessages((prev) => [...prev, payload.new]))
            .subscribe();
    }
    return () => { if (chatChannel) supabase.removeChannel(chatChannel); }
  }, [isChatOpen, currentChatMatch])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [chatMessages])

  useEffect(() => {
    if (modalMode !== 'GENERIC' && gameName.length > 1) {
        const filtered = TOP_GAMES.filter(g => g.toLowerCase().includes(gameName.toLowerCase()) && g.toLowerCase() !== gameName.toLowerCase()).slice(0, 5);
        setSuggestions(filtered);
    } else { setSuggestions([]); }
  }, [gameName, modalMode])

  // --- FUNZIONI UTILI ---

  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => console.error(err));
      } else {
          if (document.exitFullscreen) document.exitFullscreen();
      }
  }

  const formatDateTime = (dateObj) => {
      const day = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit' });
      const time = dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      return `${day} ${time}`;
  }

  const cleanupExpiredChats = async () => {
      const { data: generics } = await supabase.from('matches').select('*').eq('match_type', 'GENERIC').eq('is_archived', false);
      if (!generics) return;
      const now = new Date();
      const threeHours = 3 * 60 * 60 * 1000;
      generics.forEach(async (match) => {
          const lastActive = new Date(match.last_activity || match.created_at);
          if ((now - lastActive) > threeHours) {
              await supabase.from('matches').update({ is_archived: true }).eq('id', match.id);
          }
      });
  }

  const generateTimeOptions = () => {
    const now = new Date(); const options = [];
    const addOpt = (labelBase, dateObj) => { options.push({ label: labelBase, valueText: formatDateTime(dateObj), realDate: dateObj }); };
    addOpt('Adesso', now);
    addOpt('+15 min', new Date(now.getTime() + 15 * 60000));
    addOpt('+30 min', new Date(now.getTime() + 30 * 60000));
    addOpt('+1 ora', new Date(now.getTime() + 60 * 60000));
    const tonight = new Date(now); tonight.setHours(21, 30, 0, 0); if (now < tonight) addOpt('Stasera', tonight);
    const tomorrowM = new Date(now); tomorrowM.setDate(tomorrowM.getDate() + 1); tomorrowM.setHours(10, 0, 0, 0); addOpt('Domani Mat.', tomorrowM);
    const tomorrowP = new Date(now); tomorrowP.setDate(tomorrowP.getDate() + 1); tomorrowP.setHours(15, 0, 0, 0); addOpt('Domani Pom.', tomorrowP);
    setDynamicTimeOptions(options);
  }

  const selectSuggestion = (name) => { setGameName(name); setSuggestions([]); }

  const fetchMatches = async () => {
    const { data, error } = await supabase.from('matches').select('*').eq('is_archived', false).order('start_timestamp', { ascending: true }) 
    if (!error) setMatches(data)
  }

  const fetchMessages = async (matchId) => { 
      const { data, error } = await supabase.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }); 
      if (!error) setChatMessages(data) 
  }

  // --- LOGIN & LOGOUT ---
  const handleLogin = (e) => {
    e.preventDefault(); const name = e.target.username.value.trim();
    if (name) { localStorage.setItem('bg_user', name); setCurrentUser(name); if ("Notification" in window && Notification.permission !== "granted") { Notification.requestPermission(); } }
  }

  const handleLogout = () => {
      if (confirm("Vuoi cambiare Nickname o uscire?\n\nATTENZIONE: Se cambi nome, perderai il controllo dei tavoli creati con il vecchio nome!")) {
          localStorage.removeItem('bg_user');
          setCurrentUser('');
          setMatches([]); 
      }
  }

  // --- FEATURE: SHARE ---
  const shareMatch = (match) => {
      let text = '';
      if (match.match_type === 'GENERIC') {
          text = `💬 CHAT GOB CON: Parliamo di "${match.game_name}"? Unisciti alla discussione!`;
      } else {
          const typeText = match.match_type === 'REQUEST' ? 'CERCASI' : 'PROPOSTA';
          text = `🎲 ${typeText}: ${match.game_name}\n📍 ${match.table_name} - ⏰ ${match.match_time}\n👤 Host: ${match.host_name}\n\nUnisciti qui: https://boardgame-raduno.vercel.app`;
      }
      
      if (navigator.share) {
          navigator.share({ title: 'Gob Con Tavolo', text: text }).catch(console.error);
      } else {
          navigator.clipboard.writeText(text);
          alert("📋 Info copiate! Incolla su Telegram/WhatsApp.");
      }
  }

  // --- UI ACTIONS ---
  const openCreationModal = (mode) => { 
      setEditingMatch(null); setModalMode(mode); setGameName(''); setSuggestions([]); setNotes(''); setTableNr(''); 
      generateTimeOptions(); 
      const now = new Date(); setWhenTime(formatDateTime(now)); setTargetSortDate(now); 
      setIsModalOpen(true) 
  }

  const openEditModal = (match) => { 
      setEditingMatch(match); setModalMode(match.match_type); setGameName(match.game_name); 
      setTableNr(match.table_name.startsWith("Tavolo ") ? match.table_name.replace("Tavolo ", "") : ""); 
      setMaxPlayers(match.max_players); setNotes(match.bgg_id || ""); setWhenTime(match.match_time); 
      generateTimeOptions(); setIsModalOpen(true) 
  }

  const openChat = (match) => { setCurrentChatMatch(match); setChatMessages([]); setIsChatOpen(true) }
  const handleTimeSelect = (opt) => { setWhenTime(opt.valueText); setTargetSortDate(opt.realDate); }

  // --- DB ACTIONS ---
  const saveMatch = async () => {
    if (!gameName.trim()) { alert("Inserisci un titolo/gioco!"); return }
    if (!currentUser) return
    
    setIsSubmitting(true);

    let finalTableName = tableNr ? `Tavolo ${tableNr}` : 'Da definire';
    if (modalMode === 'REQUEST') finalTableName = 'CERCASI'; 
    if (modalMode === 'GENERIC') finalTableName = 'CHAT';

    const sortDate = targetSortDate || new Date();
    const payload = { 
        game_name: gameName, host_name: currentUser, table_name: finalTableName, 
        max_players: maxPlayers, bgg_id: notes || null, match_type: modalMode, 
        match_time: whenTime, start_timestamp: sortDate, last_activity: new Date() 
    };

    let error = null;
    if (editingMatch) {
        const { error: err } = await supabase.from('matches').update(payload).eq('id', editingMatch.id)
        error = err;
    } else {
        const { error: err } = await supabase.from('matches').insert([{ ...payload, current_players: 1, players_list: [currentUser], status: 'OPEN', is_archived: false }])
        error = err;
    }

    setIsSubmitting(false);
    if (!error) { setIsModalOpen(false); setEditingMatch(null); } else { alert("Errore salvataggio"); }
  }

  const toggleLockMatch = async (match) => {
      let newStatus = match.status === 'PLAYING' ? (match.current_players >= match.max_players ? 'FULL' : 'OPEN') : 'PLAYING';
      await supabase.from('matches').update({ status: newStatus, last_activity: new Date() }).eq('id', match.id);
  }

  const joinMatch = async (match, hasGame = false) => {
    if (match.status === 'PLAYING') { alert("Chiuso."); return; }
    if (match.players_list?.includes(currentUser)) return
    const newPlayers = [...(match.players_list || []), currentUser]
    const newCount = (match.current_players || 0) + 1
    await supabase.from('matches').update({ players_list: newPlayers, current_players: newCount, status: newCount >= match.max_players ? 'FULL' : 'OPEN', last_activity: new Date() }).eq('id', match.id)
    if (hasGame) await supabase.from('messages').insert([{ match_id: match.id, user_name: 'SISTEMA', content: `📦 ${currentUser} ha portato la scatola!` }])
  }

  const leaveMatch = async (match) => { 
      const newPlayers = (match.players_list || []).filter(p => p !== currentUser); 
      const newCount = Math.max(0, (match.current_players || 1) - 1); 
      let newStatus = match.status === 'PLAYING' ? 'PLAYING' : 'OPEN';
      await supabase.from('matches').update({ players_list: newPlayers, current_players: newCount, status: newStatus, last_activity: new Date() }).eq('id', match.id) 
  }

  const finishMatch = async (matchId) => { if(!confirm("Concludere e archiviare?")) return; setMatches(matches.filter(m => m.id !== matchId)); await supabase.from('matches').update({ is_archived: true }).eq('id', matchId) }
  
  const sendMessage = async () => { 
      if (!newMessage.trim()) return; 
      const text = newMessage.trim(); setNewMessage(''); 
      await supabase.from('messages').insert([{ match_id: currentChatMatch.id, user_name: currentUser, content: text }]);
      await supabase.from('matches').update({ last_activity: new Date() }).eq('id', currentChatMatch.id);
  }

  // --- FILTRO INTELLIGENTE ---
  const filteredMatches = matches.filter(match => {
    const textOk = match.game_name.toLowerCase().includes(searchTerm.toLowerCase()) || match.host_name.toLowerCase().includes(searchTerm.toLowerCase());
    const myMatchOk = showMyMatchesOnly ? match.players_list?.includes(currentUser) : true;
    let typeOk = true;
    if (filterType === 'OFFER') typeOk = match.match_type === 'OFFER';
    if (filterType === 'REQUEST') typeOk = match.match_type === 'REQUEST';
    if (filterType === 'GENERIC') typeOk = match.match_type === 'GENERIC';

    let timeOk = true;
    if (match.match_type !== 'GENERIC' && !match.players_list?.includes(currentUser)) {
        const start = new Date(match.start_timestamp || match.created_at);
        const diffHours = (new Date() - start) / (1000 * 60 * 60);
        if (diffHours > 5) timeOk = false;
    }
    return textOk && myMatchOk && typeOk && timeOk;
  })

  // --- RENDER ---
  if (!currentUser) return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
          <div className="flex justify-center mb-6"><img src={logoTdG} alt="Logo" className="h-24 object-contain"/></div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">Gob Con Deluxe 2026</h1>
          <p className="text-gray-500 mb-6 text-sm">Entra con il tuo Nickname</p>
          <input name="username" type="text" placeholder="Nickname" className="w-full p-4 bg-gray-100 rounded-xl mb-4 text-center text-lg outline-none focus:ring-2 focus:ring-green-500" required />
          <button className="w-full bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-800 transition">Entra in Tana</button>
        </form>
      </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans">
      <div className="bg-green-700 text-white p-3 md:p-5 shadow-md sticky top-0 z-20 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-6">
            <div className="flex items-center gap-3 md:gap-5">
                <div className="bg-white p-1 rounded-full w-12 h-12 md:w-20 md:h-20 flex items-center justify-center flex-shrink-0 shadow-sm transition-all duration-300">
                    <img src={logoTdG} alt="TdG" className="w-full h-full object-contain"/>
                </div>
                <div>
                    <h1 className="text-lg md:text-3xl font-bold leading-tight transition-all duration-300">Gob Con Deluxe 2026</h1>
                    <div className="flex items-center gap-1 text-green-100 text-[10px] md:text-sm font-medium uppercase tracking-wide transition-all duration-300">
                        <Calendar size={12}/> Arezzo, Hotel Etrusco • 27 Feb - 1 Mar
                    </div>
                </div>
            </div>
            
            <div className="flex-1 w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <input type="text" placeholder="🔎 Cerca..." className="w-full p-2 pl-8 bg-green-800/50 border border-green-600 rounded-lg text-white text-sm outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
                    <Search className="absolute left-2.5 top-2.5 text-green-300" size={14} />
                </div>
                <div className="flex bg-green-800/50 p-1 rounded-lg overflow-x-auto no-scrollbar gap-1 items-center">
                    {['ALL', 'OFFER', 'REQUEST', 'GENERIC'].map(t => (
                        <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase whitespace-nowrap transition ${filterType === t ? 'bg-white text-green-800 shadow-sm' : 'text-green-200 hover:bg-green-700'}`}>{t === 'ALL' ? 'Tutti' : (t === 'OFFER' ? 'Proposte' : (t === 'REQUEST' ? 'Richieste' : 'Chat'))}</button>
                    ))}
                    <button onClick={toggleFullscreen} className="hidden md:flex ml-1 p-1.5 bg-green-800/80 hover:bg-green-600 rounded text-green-100 transition" title="Schermo Intero">
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>
                </div>
            </div>
        </div>
      </div>

      <div className="bg-white px-4 py-2 border-b border-gray-100 flex justify-between items-center text-xs text-gray-500 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
            <span>Ciao, <b className="text-green-700">{currentUser}</b></span>
            <button onClick={handleLogout} className="p-1 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500 transition border border-gray-200" title="Cambia Nickname / Esci">
                <UserCog size={14} />
            </button>
        </div>
        <button onClick={() => setShowMyMatchesOnly(!showMyMatchesOnly)} className={`flex items-center gap-1 px-3 py-1 rounded-full border transition-all ${showMyMatchesOnly ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-gray-100 text-gray-500 border-gray-200'}`}><Filter size={12} /><span className="font-bold">I Miei Tavoli</span></button>
      </div>

      <div className="p-3 max-w-7xl mx-auto">
        {filteredMatches.length === 0 && (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center animate-fade-in">
                <div className="bg-gray-100 p-4 rounded-full mb-3"><Box size={40} className="text-gray-300"/></div>
                <p className="font-bold text-gray-500">Nessun tavolo trovato.</p>
                <p className="text-sm">Sii il primo a lanciare i dadi!</p>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMatches.map((match) => {
            const amIIn = match.players_list?.includes(currentUser); const isHost = match.host_name === currentUser; 
            const isFull = match.current_players >= match.max_players; const isPlaying = match.status === 'PLAYING';
            const isRequest = match.match_type === 'REQUEST'; const isGeneric = match.match_type === 'GENERIC';
            
            let cardBorder = 'border-l-4 border-l-green-500'; let bgColor = 'bg-white';
            if (isRequest) { cardBorder = 'border-l-4 border-l-orange-400'; bgColor = 'bg-orange-50'; }
            if (isGeneric) { cardBorder = 'border-l-4 border-l-purple-500'; bgColor = 'bg-purple-50'; }
            if (isPlaying) { bgColor = 'bg-gray-100 opacity-90'; }
            
            const lastActive = new Date(match.last_activity || match.created_at);
            const isInactive = (new Date() - lastActive) > (2 * 60 * 60 * 1000) && isGeneric; 

            const start = new Date(match.start_timestamp || match.created_at);
            const isPastStart = new Date() > start;

            return (
                <div key={match.id} className={`${bgColor} p-4 rounded-xl shadow-sm border border-gray-100 ${cardBorder} relative overflow-hidden flex flex-col gap-2 animate-fade-in h-full`}>
                <div className="flex justify-between items-start">
                    <div className="w-full">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            {isGeneric ? ( <span className="text-lg font-bold text-purple-800 leading-tight">{match.game_name}</span> ) : ( <a href={`https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(match.game_name)}`} target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-gray-800 leading-tight hover:text-green-700 hover:underline flex items-center gap-1">{match.game_name} <ExternalLink size={12} className="text-gray-400"/></a> )}
                            
                            {!isGeneric && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1 ${isPastStart ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-blue-100 text-blue-700'}`}><Clock size={10}/> {match.match_time}</span>}
                            {isPastStart && !isPlaying && !isGeneric && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">Iniziato?</span>}

                            {isPlaying && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1 bg-gray-200 text-gray-600 border border-gray-300">⛔ Start</span>}
                            {isInactive && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1 bg-red-100 text-red-600 border border-red-200 animate-pulse"><AlertTriangle size={10}/> Inattiva</span>}
                        </div>
                        <p className="text-xs text-gray-500">{isGeneric ? 'Topic creato da: ' : (isRequest ? 'Richiesto da: ' : 'Host: ')} <span className={`font-semibold ${isGeneric ? 'text-purple-700' : (isRequest ? 'text-orange-700' : 'text-green-700')}`}>{match.host_name}</span></p>
                        {match.bgg_id && <p className="text-xs text-gray-600 mt-1 p-1 bg-white/50 rounded italic border border-gray-100">" {match.bgg_id} "</p>}
                    </div>
                    <div className="flex flex-col gap-1 pl-2">
                        {isHost && ( <>
                            <button onClick={() => finishMatch(match.id)} className="text-green-600 bg-green-50 hover:bg-green-100 p-1.5 rounded-lg border border-green-200" title="Archivia"><CheckCircle size={18}/></button>
                            {!isGeneric && <button onClick={() => toggleLockMatch(match)} className={`p-1.5 rounded-lg border ${isPlaying ? 'text-red-600 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>{isPlaying ? <Unlock size={18}/> : <Lock size={18}/>}</button>}
                            <button onClick={() => openEditModal(match)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg border border-blue-200"><Edit size={18}/></button>
                        </> )}
                        <button onClick={() => shareMatch(match)} className="text-gray-400 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-lg border border-gray-200"><Share2 size={18}/></button>
                    </div>
                </div>
                {!isGeneric && (
                    <div className="flex gap-2 text-xs text-gray-600">
                        <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm"><Users size={12}/> {match.current_players}/{match.max_players}</span>
                        <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm"><MapPin size={12}/> {match.table_name}</span>
                    </div>
                )}
                <div className="flex flex-wrap gap-1 mt-1">{match.players_list?.map((p, i) => (<span key={i} className={`px-2 py-0.5 rounded text-[10px] border bg-white border-gray-200 text-gray-600`}>{p}</span>))}</div>
                <div className="mt-auto pt-2 flex gap-2">
                    <div className="flex-1">
                        {amIIn ? ( <button onClick={()=>leaveMatch(match)} className="w-full py-2.5 bg-white border border-red-200 text-red-600 font-bold rounded-lg text-xs hover:bg-red-50 flex justify-center gap-2 items-center"><LogOut size={14}/> {isGeneric ? 'Esci' : 'Lascia'}</button>
                        ) : ( isPlaying ? ( <button disabled className="w-full py-2.5 bg-gray-100 text-gray-400 font-bold rounded-lg text-xs cursor-not-allowed border border-gray-200">In Corso</button>
                          ) : ( !isFull ? ( isRequest ? (
                                    <div className="flex gap-1">
                                        <button onClick={()=>joinMatch(match, false)} className="flex-1 py-2.5 bg-orange-100 text-orange-800 font-bold rounded-lg text-xs hover:bg-orange-200 flex items-center justify-center gap-1"><UserPlus size={14}/> Unisciti</button>
                                        <button onClick={()=>joinMatch(match, true)} className="flex-1 py-2.5 bg-orange-600 text-white font-bold rounded-lg text-xs shadow-md hover:bg-orange-700 flex items-center justify-center gap-1"><Package size={14}/> Ho il gioco</button>
                                    </div>
                                ) : ( <button onClick={()=>joinMatch(match, false)} className={`w-full py-2.5 text-white font-bold rounded-lg text-xs shadow-md active:scale-95 ${isGeneric ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}>{isGeneric ? 'Partecipo alla chat' : 'Mi unisco'}</button> )
                              ) : ( <button disabled className="w-full py-2.5 bg-gray-100 text-gray-400 font-bold rounded-lg text-xs cursor-not-allowed">Completo</button> ) 
                          )
                        )}
                    </div>
                    <button onClick={() => openChat(match)} className="w-12 flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 active:scale-95 transition-colors relative"><MessageCircle size={20} /></button>
                </div>
                </div>
            )
            })}
        </div>
      </div>

      {/* QUI CI SONO I BOTTONI GALLEGGIANTI CHE MANCAVANO! */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pt-10 flex gap-2 justify-center z-20 pointer-events-none items-end">
          <button onClick={() => openCreationModal('REQUEST')} className="pointer-events-auto w-14 h-14 rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600 active:scale-95 flex items-center justify-center border-2 border-white"><HelpCircle size={24} /></button>
          <button onClick={() => openCreationModal('OFFER')} className="pointer-events-auto w-16 h-16 rounded-full bg-green-700 text-white shadow-xl hover:bg-green-800 active:scale-95 flex items-center justify-center border-2 border-white mb-1"><Box size={28} /></button>
          <button onClick={() => openCreationModal('GENERIC')} className="pointer-events-auto w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg hover:bg-purple-700 active:scale-95 flex items-center justify-center border-2 border-white"><MessagesSquare size={24} /></button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 h-[85vh] sm:h-auto shadow-2xl flex flex-col animate-slide-up">
            <div className="flex justify-between items-center mb-4"><h2 className={`text-xl font-bold ${modalMode === 'REQUEST' ? 'text-orange-600' : (modalMode === 'GENERIC' ? 'text-purple-700' : 'text-green-700')}`}>{editingMatch ? 'Modifica' : (modalMode === 'REQUEST' ? 'Cerco Gioco' : (modalMode === 'GENERIC' ? 'Nuova Chat / Tema' : 'Proponi Tavolo'))}</h2><button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button></div>
            <div className="space-y-5 flex-1 overflow-y-auto pb-4">
              <div className="relative"><label className="block text-sm font-bold text-gray-700 mb-2">{modalMode === 'GENERIC' ? 'Titolo Argomento (es. Party Game)' : (modalMode === 'REQUEST' ? 'Che gioco vorresti?' : 'A cosa giochiamo?')}</label><input type="text" placeholder="Scrivi..." className="w-full p-4 bg-gray-50 border rounded-xl text-lg outline-none focus:ring-2 focus:ring-green-500" value={gameName} onChange={(e) => setGameName(e.target.value)} autoFocus />{suggestions.length > 0 && <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">{suggestions.map((g, i) => <li key={i} onClick={() => selectSuggestion(g)} className="p-3 border-b hover:bg-green-50 cursor-pointer">{g}</li>)}</ul>}</div>
              {modalMode !== 'GENERIC' && ( <><div><label className="block text-sm font-bold text-gray-700 mb-2">Quando?</label><input type="text" value={whenTime} onChange={(e) => setWhenTime(e.target.value)} className="w-full p-3 mb-3 bg-white border border-green-500 text-green-800 font-bold rounded-xl text-center shadow-sm"/><div className="grid grid-cols-3 gap-2">{dynamicTimeOptions.map((opt, i) => (<button key={i} onClick={() => handleTimeSelect(opt)} className="p-2 bg-gray-100 border border-gray-200 rounded-lg text-xs font-medium hover:bg-green-100 hover:border-green-300 transition-colors"><div className="font-bold">{opt.label}</div><div className="text-[10px] text-gray-500">{opt.valueText}</div></button>))}</div></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-700 mb-2">Giocatori Max</label><div className="flex items-center border border-gray-200 rounded-xl bg-gray-50"><button onClick={() => setMaxPlayers(Math.max(2, maxPlayers-1))} className="px-4 py-3 hover:bg-gray-200 text-lg font-bold">-</button><input type="number" value={maxPlayers} readOnly className="w-full text-center bg-transparent font-bold"/><button onClick={() => setMaxPlayers(maxPlayers+1)} className="px-4 py-3 hover:bg-gray-200 text-lg font-bold">+</button></div></div><div><label className="block text-sm font-bold text-gray-700 mb-2">Tavolo</label>{modalMode === 'REQUEST' ? <div className="w-full p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 font-bold text-center text-sm">CERCASI</div> : <select className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl font-medium h-full" value={tableNr} onChange={(e) => setTableNr(e.target.value)}><option value="">Da definire</option>{[...Array(30)].map((_, i) => <option key={i} value={i+1}>Tavolo {i+1}</option>)}</select>}</div></div></> )}
              <div><label className="block text-sm font-bold text-gray-700 mb-2">Note / Info</label><input type="text" placeholder="Note opzionali..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500" value={notes} onChange={(e) => setNotes(e.target.value)}/></div>
              <div className="pt-2 mt-auto">
                <button onClick={saveMatch} disabled={isSubmitting} className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl text-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${modalMode === 'REQUEST' ? 'bg-orange-500' : (modalMode === 'GENERIC' ? 'bg-purple-600' : 'bg-green-700')}`}>
                    {isSubmitting ? 'Salvataggio...' : (editingMatch ? 'Salva Modifiche' : 'Pubblica')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isChatOpen && currentChatMatch && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl h-[85vh] sm:h-[600px] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
                  <div className="bg-gray-50 p-4 border-b flex justify-between items-center shadow-sm z-10"><div><h3 className="font-bold text-gray-800 text-lg leading-none">{currentChatMatch.game_name}</h3><span className="text-xs text-gray-500">Chat</span></div><button onClick={() => setIsChatOpen(false)} className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100"><X size={20}/></button></div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f0f2f5]">{chatMessages.length === 0 && <div className="text-center text-gray-400 text-sm mt-10">Scrivi il primo messaggio! 👋</div>}{chatMessages.map((msg) => { const isMe = msg.user_name === currentUser; return ( <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}><div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-green-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'}`}>{!isMe && <div className="text-[10px] font-bold text-gray-400 mb-1">{msg.user_name}</div>}{msg.content}</div><span className="text-[10px] text-gray-400 mt-1 px-1">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div> ) })}<div ref={messagesEndRef} /></div>
                  <div className="p-3 bg-white border-t flex gap-2 items-center"><input type="text" placeholder="Scrivi..." className="flex-1 p-3 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-green-500 text-sm" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} /><button onClick={sendMessage} disabled={!newMessage.trim()} className="p-3 bg-green-600 text-white rounded-xl shadow-md disabled:opacity-50 hover:bg-green-700 active:scale-95 transition-transform"><Send size={20}/></button></div>
              </div>
          </div>
      )}
    </div>
  )
}

export default App