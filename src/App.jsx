import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'
import { 
  X, Users, MapPin, LogOut, Trash2, Search, Calendar, 
  HelpCircle, Box, Clock, CheckCircle, MessageCircle, 
  Send, ExternalLink, Filter, Edit, Package, UserPlus 
} from 'lucide-react'
import logoTdG from './assets/logo.png' 
import { TOP_GAMES } from './assets/gamesList.js'

function App() {
  // --- STATI PRINCIPALI ---
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('bg_user') || '')
  const [matches, setMatches] = useState([])
  
  // Stati Modali
  const [isModalOpen, setIsModalOpen] = useState(false) 
  const [isChatOpen, setIsChatOpen] = useState(false)   
  const [modalMode, setModalMode] = useState('OFFER') 
  const [editingMatch, setEditingMatch] = useState(null)

  // Filtri
  const [searchTerm, setSearchTerm] = useState('')
  const [showMyMatchesOnly, setShowMyMatchesOnly] = useState(false)

  // Dati Form
  const [gameName, setGameName] = useState('')
  const [tableNr, setTableNr] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [notes, setNotes] = useState('')
  const [whenTime, setWhenTime] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [dynamicTimeOptions, setDynamicTimeOptions] = useState([])

  // Dati Chat
  const [currentChatMatch, setCurrentChatMatch] = useState(null)
  const [chatMessages, setChatMessages] = useState([])           
  const [newMessage, setNewMessage] = useState('')               
  const messagesEndRef = useRef(null)                            

  // --- LOGICA NOTIFICHE ---
  const sendBrowserNotification = (title, body) => {
      if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, { body: body, icon: logoTdG, silent: false });
      }
  }

  // --- EFFETTI ---
  
  // 1. GESTIONE DATI E NOTIFICHE
  useEffect(() => {
    fetchMatches()

    const globalChannel = supabase
      .channel('global_events')
      
      // A. NUOVI TAVOLI
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        fetchMatches() 
        const newMatch = payload.new;
        const myName = localStorage.getItem('bg_user');
        
        if (newMatch.host_name !== myName) {
            const isRequest = newMatch.match_type === 'REQUEST';
            const title = isRequest ? `❓ Nuova Richiesta` : `🎲 Nuovo Tavolo Proposto`;
            const body = `${newMatch.host_name} ${isRequest ? 'cerca' : 'propone'}: ${newMatch.game_name} (${newMatch.match_time})`;
            sendBrowserNotification(title, body);
        }
      })
      
      // B. UPDATE/DELETE
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { fetchMatches() })

      // C. MESSAGGI CHAT
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const newMsg = payload.new;
          const myName = localStorage.getItem('bg_user');

          if (newMsg.user_name === myName) return;

          const { data: matchData } = await supabase.from('matches').select('players_list, game_name').eq('id', newMsg.match_id).single();

          if (matchData && matchData.players_list.includes(myName)) {
              sendBrowserNotification(`💬 Chat: ${matchData.game_name}`, `${newMsg.user_name}: ${newMsg.content}`);
          }
      })
      .subscribe()

    return () => { supabase.removeChannel(globalChannel) }
  }, [])

  // 2. Chat UI
  useEffect(() => {
    if (isChatOpen && currentChatMatch) { fetchMessages(currentChatMatch.id) }
  }, [isChatOpen, currentChatMatch, matches])

  // 3. Scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [chatMessages])

  // 4. Autocomplete
  useEffect(() => {
    if (gameName.length > 1) {
        const filtered = TOP_GAMES.filter(g => g.toLowerCase().includes(gameName.toLowerCase()) && g.toLowerCase() !== gameName.toLowerCase()).slice(0, 5);
        setSuggestions(filtered);
    } else { setSuggestions([]); }
  }, [gameName])

  // --- LOGICA ORARI ---
  const generateTimeOptions = () => {
    const now = new Date(); const options = [];
    const formatTime = (date) => date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    options.push({ label: 'Adesso', value: formatTime(now) });
    options.push({ label: '+15 min', value: formatTime(new Date(now.getTime() + 15 * 60000)) });
    options.push({ label: '+30 min', value: formatTime(new Date(now.getTime() + 30 * 60000)) });
    options.push({ label: '+1 ora', value: formatTime(new Date(now.getTime() + 60 * 60000)) });
    options.push({ label: 'Stasera', value: "Stasera 21:30" });
    options.push({ label: 'Domani Mat.', value: "Domani 10:00" });
    options.push({ label: 'Domani Pom.', value: "Domani 15:00" });
    setDynamicTimeOptions(options);
  }

  // --- HELPER ---
  const selectSuggestion = (name) => { setGameName(name); setSuggestions([]); }

  const fetchMatches = async () => {
    const { data, error } = await supabase.from('matches').select('*').eq('is_archived', false).order('created_at', { ascending: false })
    if (!error) {
        const sorted = data.sort((a, b) => {
            const isTomorrowA = a.match_time.toLowerCase().includes('domani'); const isTomorrowB = b.match_time.toLowerCase().includes('domani');
            if (!isTomorrowA && isTomorrowB) return -1; if (isTomorrowA && !isTomorrowB) return 1; return 0;
        });
        setMatches(sorted)
    }
  }

  const fetchMessages = async (matchId) => { const { data, error } = await supabase.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }); if (!error) setChatMessages(data) }

  const handleLogin = async (e) => {
    e.preventDefault(); const name = e.target.username.value.trim();
    if (name) { localStorage.setItem('bg_user', name); setCurrentUser(name); if ("Notification" in window && Notification.permission !== "granted") { await Notification.requestPermission(); } }
  }

  // --- UI ACTIONS ---
  const openCreationModal = (mode) => { setEditingMatch(null); setModalMode(mode); setGameName(''); setSuggestions([]); setNotes(''); setTableNr(''); generateTimeOptions(); setWhenTime(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })); setIsModalOpen(true) }

  const openEditModal = (match) => { setEditingMatch(match); setModalMode(match.match_type); setGameName(match.game_name); setTableNr(match.table_name.startsWith("Tavolo ") ? match.table_name.replace("Tavolo ", "") : ""); setMaxPlayers(match.max_players); setNotes(match.bgg_id || ""); setWhenTime(match.match_time); generateTimeOptions(); setIsModalOpen(true) }

  const openChat = (match) => { setCurrentChatMatch(match); setChatMessages([]); setIsChatOpen(true) }

  // --- DB ACTIONS ---
  const saveMatch = async () => {
    if (!gameName.trim()) { alert("Scrivi il nome del gioco!"); return }
    if (!currentUser) return
    let finalTableName = tableNr ? `Tavolo ${tableNr}` : 'Da definire';
    if (modalMode === 'REQUEST') finalTableName = 'CERCASI'; 
    if (editingMatch) {
        const { error } = await supabase.from('matches').update({ game_name: gameName, table_name: finalTableName, max_players: maxPlayers, bgg_id: notes || null, match_time: whenTime }).eq('id', editingMatch.id)
        if (!error) { setIsModalOpen(false); setEditingMatch(null); } else { alert("Errore modifica"); }
    } else {
        const { error } = await supabase.from('matches').insert([{ game_name: gameName, host_name: currentUser, table_name: finalTableName, max_players: maxPlayers, current_players: 1, players_list: [currentUser], status: 'OPEN', bgg_id: notes || null, match_type: modalMode, match_time: whenTime, is_archived: false }])
        if (!error) setIsModalOpen(false); else alert("Errore salvataggio")
    }
  }

  // AGGIORNATO: Join ora accetta hasGame
  const joinMatch = async (match, hasGame = false) => {
    if (match.players_list?.includes(currentUser)) return
    const newPlayers = [...(match.players_list || []), currentUser]
    const newCount = (match.current_players || 0) + 1
    
    // Aggiorna giocatori
    await supabase.from('matches').update({ players_list: newPlayers, current_players: newCount, status: newCount >= match.max_players ? 'FULL' : 'OPEN' }).eq('id', match.id)

    // Se l'utente dice di avere il gioco, invia messaggio automatico
    if (hasGame) {
        await supabase.from('messages').insert([{
            match_id: match.id,
            user_name: 'SISTEMA', // O currentUser
            content: `📦 ${currentUser} ha portato la scatola del gioco!`
        }])
    }
  }

  const leaveMatch = async (match) => { const newPlayers = (match.players_list || []).filter(p => p !== currentUser); const newCount = Math.max(0, (match.current_players || 1) - 1); await supabase.from('matches').update({ players_list: newPlayers, current_players: newCount, status: 'OPEN' }).eq('id', match.id) }
  const finishMatch = async (matchId) => { if(!confirm("La partita è finita o il tavolo è stato annullato?")) return; setMatches(matches.filter(m => m.id !== matchId)); await supabase.from('matches').update({ is_archived: true }).eq('id', matchId) }
  const deleteMatch = async (matchId) => { if(!confirm("Vuoi cancellare definitivamente?")) return; setMatches(matches.filter(m => m.id !== matchId)); await supabase.from('matches').delete().eq('id', matchId); }
  const sendMessage = async () => { if (!newMessage.trim()) return; const text = newMessage.trim(); setNewMessage(''); await supabase.from('messages').insert([{ match_id: currentChatMatch.id, user_name: currentUser, content: text }]) }

  // --- FILTRO ---
  const filteredMatches = matches.filter(match => {
    const matchesSearch = match.game_name.toLowerCase().includes(searchTerm.toLowerCase()) || match.host_name.toLowerCase().includes(searchTerm.toLowerCase());
    if (showMyMatchesOnly) return matchesSearch && match.players_list?.includes(currentUser);
    return matchesSearch;
  })

  // --- RENDER ---
  if (!currentUser) return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
          <div className="flex justify-center mb-6"><img src={logoTdG} alt="Logo" className="h-24 object-contain"/></div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">Gob Con Deluxe 2026</h1>
          <p className="text-gray-500 mb-6 text-sm">Entra con il tuo Nickname</p>
          <input name="username" type="text" placeholder="Nickname" className="w-full p-4 bg-gray-100 rounded-xl mb-4 text-center text-lg outline-none focus:ring-2 focus:ring-green-500" required />
          <button className="w-full bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-800 transition">Entra e Attiva Notifiche</button>
        </form>
      </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans">
      <div className="bg-yellow-400 text-yellow-900 text-center text-xs font-bold p-1">⚠️ VERSIONE DI TEST LOCALE</div>
      
      {/* NAVBAR */}
      <div className="bg-green-700 text-white p-3 shadow-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <div className="bg-white p-1 rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0 shadow-sm"><img src={logoTdG} alt="TdG" className="w-full h-full object-contain"/></div>
                <div><h1 className="text-lg font-bold leading-tight">Gob Con Deluxe 2026</h1><div className="flex items-center gap-1 text-green-100 text-[10px] font-medium uppercase tracking-wide"><Calendar size={10}/> Arezzo 27 Feb - 1 Mar</div></div>
            </div>
            <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                <input type="text" placeholder="🔎 Cerca gioco..." className="w-full p-2.5 pl-9 bg-green-800/50 border border-green-600 rounded-lg text-white text-sm placeholder-green-200 outline-none focus:bg-green-800 transition" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
                <Search className="absolute left-3 top-3 text-green-300" size={16} />
            </div>
        </div>
      </div>

      <div className="bg-white px-4 py-2 border-b border-gray-100 flex justify-between items-center text-xs text-gray-500 max-w-7xl mx-auto w-full">
        <span>Ciao, <b className="text-green-700">{currentUser}</b></span>
        <button onClick={() => setShowMyMatchesOnly(!showMyMatchesOnly)} className={`flex items-center gap-1 px-3 py-1 rounded-full border transition-all ${showMyMatchesOnly ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-gray-100 text-gray-500 border-gray-200'}`}><Filter size={12} /><span className="font-bold">I Miei Tavoli</span></button>
      </div>

      <div className="p-3 max-w-7xl mx-auto">
        {filteredMatches.length === 0 && (
            <div className="text-center py-10 text-gray-400">
                <p>{showMyMatchesOnly ? 'Non sei iscritto a nessun tavolo.' : 'Nessuna attività.'}</p>
                {showMyMatchesOnly && <button onClick={() => setShowMyMatchesOnly(false)} className="mt-2 text-green-600 font-bold underline">Mostra tutti</button>}
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMatches.map((match) => {
            const amIIn = match.players_list?.includes(currentUser); const isHost = match.host_name === currentUser; const isFull = match.current_players >= match.max_players; const isRequest = match.match_type === 'REQUEST';
            const cardBorder = isRequest ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-green-500'; const bgColor = isRequest ? 'bg-orange-50' : 'bg-white';
            
            return (
                <div key={match.id} className={`${bgColor} p-4 rounded-xl shadow-sm border border-gray-100 ${cardBorder} relative overflow-hidden flex flex-col gap-2 animate-fade-in h-full`}>
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <a href={`https://boardgamegeek.com/geeksearch.php?action=search&objecttype=boardgame&q=${encodeURIComponent(match.game_name)}`} target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-gray-800 leading-tight hover:text-green-700 hover:underline flex items-center gap-1">{match.game_name} <ExternalLink size={12} className="text-gray-400"/></a>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1 bg-blue-100 text-blue-700`}><Clock size={10}/> {match.match_time}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{isRequest ? 'Richiesto da: ' : 'Host: '} <span className={`font-semibold ${isRequest ? 'text-orange-700' : 'text-green-700'}`}>{match.host_name}</span></p>
                        {match.bgg_id && <p className="text-xs text-gray-600 mt-1 p-1 bg-gray-50 rounded italic border border-gray-100">" {match.bgg_id} "</p>}
                    </div>
                    <div className="flex flex-col gap-2">
                        {isHost && ( <><button onClick={() => finishMatch(match.id)} className="text-green-600 bg-green-50 hover:bg-green-100 p-1.5 rounded-lg border border-green-200" title="Concludi"><CheckCircle size={20}/></button><button onClick={() => openEditModal(match)} className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg border border-blue-200" title="Modifica"><Edit size={20}/></button><button onClick={() => deleteMatch(match.id)} className="text-gray-300 hover:text-red-500 p-1" title="Elimina"><Trash2 size={14}/></button></> )}
                    </div>
                </div>
                <div className="flex gap-2 text-xs text-gray-600">
                    <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm"><Users size={12}/> {match.current_players}/{match.max_players}</span>
                    <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm"><MapPin size={12}/> {match.table_name}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                    {match.players_list?.map((p, i) => (<span key={i} className={`px-2 py-0.5 rounded text-[10px] border ${p===match.host_name ? (isRequest ? 'bg-orange-100 border-orange-200 text-orange-800' : 'bg-green-100 border-green-200 text-green-800') : 'bg-white border-gray-200 text-gray-600'}`}>{p}</span>))}
                </div>
                
                <div className="mt-auto pt-2 flex gap-2">
                    <div className="flex-1">
                        {amIIn ? ( 
                            <button onClick={()=>leaveMatch(match)} className="w-full py-2.5 bg-white border border-red-200 text-red-600 font-bold rounded-lg text-xs hover:bg-red-50 flex justify-center gap-2 items-center"><LogOut size={14}/> {isRequest ? 'Annulla' : 'Lascia'}</button>
                        ) : ( 
                          !isFull ? ( 
                            // QUI C'È LA NUOVA LOGICA: SE È RICHIESTA -> DOPPIO BOTTONE
                            isRequest ? (
                                <div className="flex gap-1">
                                    <button onClick={()=>joinMatch(match, false)} className="flex-1 py-2.5 bg-orange-100 text-orange-800 font-bold rounded-lg text-xs hover:bg-orange-200 active:scale-95 flex items-center justify-center gap-1">
                                        <UserPlus size={14}/> Mi unisco
                                    </button>
                                    <button onClick={()=>joinMatch(match, true)} className="flex-1 py-2.5 bg-orange-600 text-white font-bold rounded-lg text-xs shadow-md hover:bg-orange-700 active:scale-95 flex items-center justify-center gap-1">
                                        <Package size={14}/> Ho la scatola
                                    </button>
                                </div>
                            ) : (
                                // SE È OFFERTA -> BOTTONE SINGOLO CLASSICO
                                <button onClick={()=>joinMatch(match, false)} className="w-full py-2.5 bg-green-600 text-white font-bold rounded-lg text-xs shadow-md hover:bg-green-700 active:scale-95">
                                    Mi unisco
                                </button>
                            )
                          ) : ( 
                            <button disabled className="w-full py-2.5 bg-gray-100 text-gray-400 font-bold rounded-lg text-xs cursor-not-allowed">Completo</button> 
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pt-10 flex gap-3 justify-center z-20 pointer-events-none">
          <button onClick={() => openCreationModal('REQUEST')} className="pointer-events-auto flex-1 max-w-[160px] bg-orange-500 text-white p-3 rounded-xl shadow-lg hover:bg-orange-600 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1"><HelpCircle size={24} /><span className="text-xs font-bold">Richiedi Gioco</span></button>
          <button onClick={() => openCreationModal('OFFER')} className="pointer-events-auto flex-1 max-w-[160px] bg-green-700 text-white p-3 rounded-xl shadow-lg hover:bg-green-800 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1"><Box size={24} /><span className="text-xs font-bold">Proponi Tavolo</span></button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 h-[85vh] sm:h-auto shadow-2xl flex flex-col animate-slide-up">
            <div className="flex justify-between items-center mb-4"><h2 className={`text-xl font-bold ${modalMode === 'REQUEST' ? 'text-orange-600' : 'text-green-700'}`}>{editingMatch ? 'Modifica Tavolo' : (modalMode === 'REQUEST' ? 'Cerco Gioco' : 'Proponi Tavolo')}</h2><button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button></div>
            <div className="space-y-5 flex-1 overflow-y-auto pb-4">
              <div className="relative"><label className="block text-sm font-bold text-gray-700 mb-2">{modalMode === 'REQUEST' ? 'Che gioco vorresti?' : 'A cosa giochiamo?'}</label><input type="text" placeholder="Scrivi..." className={`w-full p-4 bg-gray-50 border rounded-xl text-lg outline-none focus:ring-2 ${modalMode === 'REQUEST' ? 'focus:ring-orange-400' : 'focus:ring-green-500'}`} value={gameName} onChange={(e) => setGameName(e.target.value)} autoFocus />{suggestions.length > 0 && <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">{suggestions.map((g, i) => <li key={i} onClick={() => selectSuggestion(g)} className="p-3 border-b hover:bg-green-50 cursor-pointer">{g}</li>)}</ul>}</div>
              <div><label className="block text-sm font-bold text-gray-700 mb-2">Quando? (Orario modificabile)</label><input type="text" value={whenTime} onChange={(e) => setWhenTime(e.target.value)} className="w-full p-3 mb-3 bg-white border border-green-500 text-green-800 font-bold rounded-xl text-center shadow-sm"/><div className="grid grid-cols-3 gap-2">{dynamicTimeOptions.map((opt, i) => (<button key={i} onClick={() => setWhenTime(opt.value)} className="p-2 bg-gray-100 border border-gray-200 rounded-lg text-xs font-medium hover:bg-green-100 hover:border-green-300 transition-colors"><div className="font-bold">{opt.label}</div><div className="text-[10px] text-gray-500">{opt.value.includes(' ') ? '' : opt.value}</div></button>))}</div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-gray-700 mb-2">Giocatori Max</label><div className="flex items-center border border-gray-200 rounded-xl bg-gray-50"><button onClick={() => setMaxPlayers(Math.max(2, maxPlayers-1))} className="px-4 py-3 hover:bg-gray-200 text-lg font-bold">-</button><input type="number" value={maxPlayers} readOnly className="w-full text-center bg-transparent font-bold"/><button onClick={() => setMaxPlayers(maxPlayers+1)} className="px-4 py-3 hover:bg-gray-200 text-lg font-bold">+</button></div></div><div><label className="block text-sm font-bold text-gray-700 mb-2">Tavolo</label>{modalMode === 'REQUEST' ? <div className="w-full p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 font-bold text-center text-sm">CERCASI</div> : <select className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl font-medium h-full" value={tableNr} onChange={(e) => setTableNr(e.target.value)}><option value="">Da definire</option>{[...Array(30)].map((_, i) => <option key={i} value={i+1}>Tavolo {i+1}</option>)}</select>}</div></div>
              <div><label className="block text-sm font-bold text-gray-700 mb-2">Note</label><input type="text" placeholder="Note opzionali..." className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500" value={notes} onChange={(e) => setNotes(e.target.value)}/></div>
              <div className="pt-2 mt-auto"><button onClick={saveMatch} className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl text-lg active:scale-95 ${modalMode === 'REQUEST' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-700 hover:bg-green-800'}`}>{editingMatch ? 'Salva Modifiche' : (modalMode === 'REQUEST' ? 'Pubblica' : 'Crea Tavolo')}</button></div>
            </div>
          </div>
        </div>
      )}

      {isChatOpen && currentChatMatch && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl h-[85vh] sm:h-[600px] shadow-2xl flex flex-col overflow-hidden animate-slide-up">
                  <div className="bg-gray-50 p-4 border-b flex justify-between items-center shadow-sm z-10"><div><h3 className="font-bold text-gray-800 text-lg leading-none">{currentChatMatch.game_name}</h3><span className="text-xs text-gray-500">Chat del tavolo</span></div><button onClick={() => setIsChatOpen(false)} className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100"><X size={20}/></button></div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f0f2f5]">{chatMessages.length === 0 && <div className="text-center text-gray-400 text-sm mt-10">Non ci sono ancora messaggi.<br/>Scrivi il primo! 👋</div>}{chatMessages.map((msg) => { const isMe = msg.user_name === currentUser; return ( <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}><div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-green-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'}`}>{!isMe && <div className="text-[10px] font-bold text-gray-400 mb-1">{msg.user_name}</div>}{msg.content}</div><span className="text-[10px] text-gray-400 mt-1 px-1">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div> ) })}<div ref={messagesEndRef} /></div>
                  <div className="p-3 bg-white border-t flex gap-2 items-center"><input type="text" placeholder="Scrivi..." className="flex-1 p-3 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-green-500 text-sm" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} /><button onClick={sendMessage} disabled={!newMessage.trim()} className="p-3 bg-green-600 text-white rounded-xl shadow-md disabled:opacity-50 hover:bg-green-700 active:scale-95 transition-transform"><Send size={20}/></button></div>
              </div>
          </div>
      )}
    </div>
  )
}

export default App