import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Plus, X, Users, MapPin, LogOut, Trash2, Search, Calendar, HelpCircle, Box } from 'lucide-react'
import logoTdG from './assets/logo.png' 

// IMPORTIAMO LA LISTA GIOCHI LOCALE
import { TOP_GAMES } from './assets/gamesList.js'

function App() {
  // --- STATI ---
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('bg_user') || '')
  const [matches, setMatches] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('OFFER') 

  const [searchTerm, setSearchTerm] = useState('')

  // Dati Form
  const [gameName, setGameName] = useState('')
  const [tableNr, setTableNr] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [notes, setNotes] = useState('')

  // STATO PER I SUGGERIMENTI (AUTOCOMPLETE)
  const [suggestions, setSuggestions] = useState([])

  // --- EFFETTI ---
  useEffect(() => {
    fetchMatches()
    const channel = supabase
      .channel('matches_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.eventType === 'DELETE') {
            setMatches(current => current.filter(match => match.id !== payload.old.id))
        } else {
            fetchMatches()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Logica Autocomplete: filtra la lista quando scrivi
  useEffect(() => {
    if (gameName.length > 1) {
        const filtered = TOP_GAMES.filter(g => 
            g.toLowerCase().includes(gameName.toLowerCase()) && 
            g.toLowerCase() !== gameName.toLowerCase()
        ).slice(0, 5); // Mostra solo i primi 5 risultati
        setSuggestions(filtered);
    } else {
        setSuggestions([]);
    }
  }, [gameName])

  const selectSuggestion = (name) => {
      setGameName(name)
      setSuggestions([]) // Nascondi suggerimenti
  }

  const fetchMatches = async () => {
    const { data, error } = await supabase.from('matches').select('*').order('created_at', { ascending: false })
    if (!error) setMatches(data)
  }

  const handleLogin = (e) => {
    e.preventDefault()
    const name = e.target.username.value.trim()
    if (name) { localStorage.setItem('bg_user', name); setCurrentUser(name) }
  }

  const openModal = (mode) => {
      setModalMode(mode)
      setGameName('')
      setSuggestions([])
      setNotes('')
      setTableNr('') 
      setIsModalOpen(true)
  }

  const createMatch = async () => {
    if (!gameName.trim()) { alert("Scrivi il nome del gioco!"); return }
    if (!currentUser) return

    let finalTableName = tableNr ? `Tavolo ${tableNr}` : 'Da definire';
    if (modalMode === 'REQUEST') finalTableName = 'CERCASI'; 

    const { error } = await supabase.from('matches').insert([{
      game_name: gameName,
      host_name: currentUser,
      table_name: finalTableName,
      max_players: maxPlayers,
      current_players: 1,
      players_list: [currentUser],
      status: 'OPEN',
      bgg_id: notes || null,
      match_type: modalMode
    }])

    if (!error) {
      setIsModalOpen(false);
    } else {
      alert("Errore salvataggio")
    }
  }

  const joinMatch = async (match) => {
    if (match.players_list?.includes(currentUser)) return
    const newPlayers = [...(match.players_list || []), currentUser]
    const newCount = (match.current_players || 0) + 1
    await supabase.from('matches').update({ 
        players_list: newPlayers, current_players: newCount, 
        status: newCount >= match.max_players ? 'FULL' : 'OPEN'
    }).eq('id', match.id)
  }

  const leaveMatch = async (match) => {
    const newPlayers = (match.players_list || []).filter(p => p !== currentUser)
    const newCount = Math.max(0, (match.current_players || 1) - 1)
    await supabase.from('matches').update({ 
        players_list: newPlayers, current_players: newCount, status: 'OPEN' 
    }).eq('id', match.id)
  }

  const deleteMatch = async (matchId) => {
    if(!confirm("Vuoi eliminare definitivamente?")) return;
    setMatches(matches.filter(m => m.id !== matchId));
    await supabase.from('matches').delete().eq('id', matchId)
  }

  const filteredMatches = matches.filter(match => 
    match.game_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    match.host_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // --- RENDER LOGIN ---
  if (!currentUser) return (
      <div className="min-h-screen bg-green-900 flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
          <div className="flex justify-center mb-6">
             <img src={logoTdG} alt="Logo Tana" className="h-24 object-contain"/>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">Gob Con Deluxe 2026</h1>
          <p className="text-gray-500 mb-6 text-sm">Entra con il tuo Nickname</p>
          <input name="username" type="text" placeholder="Nickname" className="w-full p-4 bg-gray-100 rounded-xl mb-4 text-center text-lg outline-none focus:ring-2 focus:ring-green-500" required />
          <button className="w-full bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-green-800 transition">Entra</button>
        </form>
      </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans">
      
      {/* HEADER */}
      <div className="bg-green-700 text-white p-3 shadow-md sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-2">
            <div className="bg-white p-1 rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                <img src={logoTdG} alt="TdG" className="w-full h-full object-contain"/>
            </div>
            <div>
                <h1 className="text-lg font-bold leading-tight">Gob Con Deluxe 2026</h1>
                <div className="flex items-center gap-1 text-green-100 text-[10px] font-medium uppercase tracking-wide">
                    <Calendar size={10}/> Arezzo 27 Feb - 1 Mar
                </div>
            </div>
        </div>
        
        <div className="relative">
            <input 
                type="text" 
                placeholder="🔎 Cerca gioco..." 
                className="w-full p-2.5 pl-9 bg-green-800/50 border border-green-600 rounded-lg text-white text-sm placeholder-green-200 outline-none focus:bg-green-800 transition"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-3 text-green-300" size={16} />
        </div>
      </div>

      <div className="bg-white px-4 py-2 border-b border-gray-100 flex justify-between items-center text-xs text-gray-500">
        <span>Ciao, <b className="text-green-700">{currentUser}</b></span>
        {searchTerm && <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Filtro attivo</span>}
      </div>

      <div className="p-3 max-w-md mx-auto space-y-3">
        {filteredMatches.length === 0 && (
            <div className="text-center py-10 text-gray-400">
                <p>Nessuna attività.</p>
                <p className="text-sm mt-1">Usa i tasti in basso per iniziare!</p>
            </div>
        )}

        {filteredMatches.map((match) => {
          const amIIn = match.players_list?.includes(currentUser)
          const isHost = match.host_name === currentUser
          const isFull = match.current_players >= match.max_players
          
          const isRequest = match.match_type === 'REQUEST'
          const cardBorder = isRequest ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-green-500'
          const bgColor = isRequest ? 'bg-orange-50' : 'bg-white'

          return (
            <div key={match.id} className={`${bgColor} p-4 rounded-xl shadow-sm border border-gray-100 ${cardBorder} relative overflow-hidden flex flex-col gap-2 animate-fade-in`}>
              
              <div className="flex justify-between items-start">
                 <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-800 leading-tight">{match.game_name}</h2>
                        {isRequest && <span className="text-[10px] font-bold bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded uppercase">Cerco</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        {isRequest ? 'Richiesto da: ' : 'Host: '} 
                        <span className={`font-semibold ${isRequest ? 'text-orange-700' : 'text-green-700'}`}>{match.host_name}</span>
                    </p>
                    {match.bgg_id && <p className="text-xs text-gray-600 mt-0.5 italic">"{match.bgg_id}"</p>}
                 </div>
                 
                 {isHost && (
                     <button onClick={() => deleteMatch(match.id)} className="text-gray-300 hover:text-red-500 p-1.5"><Trash2 size={18}/></button>
                 )}
              </div>

              <div className="flex gap-2 text-xs text-gray-600">
                   <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm">
                       <Users size={12}/> {match.current_players}/{match.max_players}
                   </span>
                   <span className="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm">
                       <MapPin size={12}/> {match.table_name}
                   </span>
              </div>

              <div className="flex flex-wrap gap-1 mt-1">
                  {match.players_list?.map((p, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded text-[10px] border ${p===match.host_name ? (isRequest ? 'bg-orange-100 border-orange-200 text-orange-800' : 'bg-green-100 border-green-200 text-green-800') : 'bg-white border-gray-200 text-gray-600'}`}>
                          {p}
                      </span>
                  ))}
              </div>
              
              <div className="mt-2">
                {amIIn ? (
                   <button onClick={()=>leaveMatch(match)} className="w-full py-2.5 bg-white border border-red-200 text-red-600 font-bold rounded-lg text-xs hover:bg-red-50 flex justify-center gap-2 items-center">
                       <LogOut size={14}/> {isRequest ? 'Annulla' : 'Lascia Tavolo'}
                   </button>
                ) : (
                   !isFull ? (
                     <button onClick={()=>joinMatch(match)} className={`w-full py-2.5 text-white font-bold rounded-lg text-xs shadow-md transition-transform active:scale-95 ${isRequest ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-200' : 'bg-green-600 hover:bg-green-700 shadow-green-200'}`}>
                         {isRequest ? 'Ce l\'ho io / Mi unisco!' : 'Mi unisco'}
                     </button>
                   ) : (
                    <button disabled className="w-full py-2.5 bg-gray-100 text-gray-400 font-bold rounded-lg text-xs cursor-not-allowed">
                        Completo
                    </button>
                   )
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pt-10 flex gap-3 justify-center z-20">
          <button onClick={() => openModal('REQUEST')} className="flex-1 max-w-[160px] bg-orange-500 text-white p-3 rounded-xl shadow-lg hover:bg-orange-600 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1">
            <HelpCircle size={24} />
            <span className="text-xs font-bold">Richiedi Gioco</span>
          </button>
          <button onClick={() => openModal('OFFER')} className="flex-1 max-w-[160px] bg-green-700 text-white p-3 rounded-xl shadow-lg hover:bg-green-800 active:scale-95 transition-transform flex flex-col items-center justify-center gap-1">
            <Box size={24} />
            <span className="text-xs font-bold">Proponi Tavolo</span>
          </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 h-[80vh] sm:h-auto shadow-2xl flex flex-col animate-slide-up">
            
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-xl font-bold ${modalMode === 'REQUEST' ? 'text-orange-600' : 'text-green-700'}`}>
                  {modalMode === 'REQUEST' ? 'Cerco Gioco / Giocatori' : 'Proponi un Tavolo'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>

            <div className="space-y-6 flex-1">
              
              {/* CAMPO NOME CON AUTOCOMPLETE */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                    {modalMode === 'REQUEST' ? 'Che gioco vorresti provare?' : 'A cosa giochiamo?'}
                </label>
                <input 
                    type="text" 
                    placeholder="Inizia a scrivere..." 
                    className={`w-full p-4 bg-gray-50 border rounded-xl text-lg outline-none focus:ring-2 ${modalMode === 'REQUEST' ? 'focus:ring-orange-400' : 'focus:ring-green-500'}`}
                    value={gameName} 
                    onChange={(e) => setGameName(e.target.value)} 
                    autoFocus
                />
                
                {/* LISTA SUGGERIMENTI */}
                {suggestions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {suggestions.map((game, i) => (
                            <li 
                                key={i} 
                                onClick={() => selectSuggestion(game)}
                                className="p-3 border-b last:border-0 hover:bg-green-50 cursor-pointer text-gray-700 font-medium"
                            >
                                {game}
                            </li>
                        ))}
                    </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-2">Giocatori Max</label>
                   <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                     <button onClick={() => setMaxPlayers(Math.max(2, maxPlayers-1))} className="px-4 py-3 hover:bg-gray-200 text-lg font-bold">-</button>
                     <input type="number" value={maxPlayers} readOnly className="w-full text-center outline-none bg-transparent font-bold"/>
                     <button onClick={() => setMaxPlayers(maxPlayers+1)} className="px-4 py-3 hover:bg-gray-200 text-lg font-bold">+</button>
                   </div>
                 </div>
                 
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-2">Tavolo</label>
                   {modalMode === 'REQUEST' ? (
                       <div className="w-full p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 font-bold text-center text-sm">
                           CERCASI
                       </div>
                   ) : (
                       <select className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-medium h-full" value={tableNr} onChange={(e) => setTableNr(e.target.value)}>
                         <option value="">Da definire</option>
                         {[...Array(30)].map((_, i) => <option key={i} value={i+1}>Tavolo {i+1}</option>)}
                       </select>
                   )}
                 </div>
              </div>
            
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Note (Opzionale)</label>
                  <input 
                    type="text" 
                    placeholder={modalMode === 'REQUEST' ? "Es. Qualcuno ha la scatola?" : "Es. Spiego io le regole"}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-green-500"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
              </div>

              <div className="pt-4 mt-auto">
                <button 
                    onClick={createMatch} 
                    className={`w-full text-white font-bold py-4 rounded-2xl shadow-xl text-lg active:scale-95 transition-transform ${modalMode === 'REQUEST' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-700 hover:bg-green-800'}`}
                >
                    {modalMode === 'REQUEST' ? 'Pubblica Richiesta' : 'Pubblica Tavolo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App