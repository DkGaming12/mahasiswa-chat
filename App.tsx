import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, User, Plus, Check, X, LogOut, 
  Search, Send, ArrowLeft, UserPlus, Clock, Users, Loader2, WifiOff 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDoc, 
  query, where, onSnapshot, addDoc, updateDoc, 
  serverTimestamp, orderBy, limit 
} from 'firebase/firestore';

// --- PERBAIKAN KONFIGURASI (Sesuai Screenshot Mas Didi) ---
const firebaseConfig = {
  apiKey: "AIzaSyBK0be6JgLVWb71sspT8CLk3rbnzxjWnz4",
  // Perhatikan baris di bawah ini, saya sesuaikan dengan ID di screenshot
  authDomain: "mahasiswa-chat-25e5d.firebaseapp.com",
  projectId: "mahasiswa-chat-25e5d",
  storageBucket: "mahasiswa-chat-25e5d.firebasestorage.app",
  messagingSenderId: "991996803084",
  appId: "1:991996803084:web:..." // Opsional, tapi biarkan firebase handle sisanya
};

// Inisialisasi App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- TIPE DATA ---
interface UserProfile {
  nim: string;
  name: string;
  password?: string; 
  uid: string;
  jurusan?: string;
}

interface FriendRequest {
  id: string;
  fromNim: string;
  fromName: string;
  toNim: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: any;
}

interface Message {
  id: string;
  senderNim: string;
  text: string;
  timestamp: any;
}

// --- KOMPONEN UTAMA ---
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  
  // DEBUG STATE
  const [connectionStatus, setConnectionStatus] = useState<string>('Menghubungkan ke server...');
  const [isError, setIsError] = useState(false);

  const [view, setView] = useState<'login' | 'register' | 'main'>('login');
  const [activeTab, setActiveTab] = useState<'chats' | 'requests' | 'add'>('chats');
  const [activeChatNim, setActiveChatNim] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState<string>('');
  
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [nimInput, setNimInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [jurusanInput, setJurusanInput] = useState('');
  const [searchNim, setSearchNim] = useState('');
  const [messageText, setMessageText] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const dummyEndRef = useRef<HTMLDivElement>(null);

  // --- 1. CEK LOGIN & KONEKSI ---
  useEffect(() => {
    setConnectionStatus("Mencoba menghubungi Google...");
    
    signInAnonymously(auth)
      .then(() => {
        console.log("DEBUG: Berhasil signInAnonymously");
        setConnectionStatus("Terhubung ke Server ✅");
        setIsError(false);
      })
      .catch((error) => {
        console.error("DEBUG: Gagal Auth:", error);
        setConnectionStatus(`Gagal Konek: ${error.message}`);
        setIsError(true);
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFirebaseUser(user);
        setConnectionStatus("Siap digunakan (Authenticated) ✅");
      } else {
        setConnectionStatus("Belum login ke sistem.");
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. DENGARKAN DATA ---
  useEffect(() => {
    if (!currentUser) return;

    const requestsQuery = query(
      collection(db, 'requests'), 
      where('toNim', '==', currentUser.nim)
    );

    const unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
      const reqs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as FriendRequest))
        .filter(r => r.status === 'pending');
      setRequests(reqs);
    });

    const friendsQuery = query(
      collection(db, 'requests'),
      where('status', '==', 'accepted')
    );

    const unsubFriends = onSnapshot(friendsQuery, (snapshot) => {
      const allAccepted = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
      const myFriends = allAccepted.filter(r => r.fromNim === currentUser.nim || r.toNim === currentUser.nim);
      setFriends(myFriends);
    });

    return () => { /* Cleanup */ };
  }, [currentUser]);

  // --- 3. DENGARKAN CHAT ---
  useEffect(() => {
    if (!currentUser || !activeChatNim) return;
    const chatId = [currentUser.nim, activeChatNim].sort().join('_');
    const msgsQuery = query(
      collection(db, `chats_${chatId}`), 
      orderBy('timestamp', 'asc'),
      limit(100)
    );
    const unsubMsgs = onSnapshot(msgsQuery, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
      setTimeout(() => dummyEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubMsgs();
  }, [currentUser, activeChatNim]);


  // --- ACTIONS ---

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRegister = async () => {
    // 1. Validasi Input
    if (!nimInput || !nameInput || !passwordInput) {
      alert("Mas Didi, tolong isi semua kolomnya ya!");
      return;
    }
    
    // 2. Validasi Koneksi
    if (!firebaseUser) {
      alert("BELUM KONEK KE SERVER GOOGLE! Cek internetmu Mas.");
      return;
    }

    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', nimInput); 
      const snap = await getDoc(userDocRef);
      
      if (snap.exists()) {
        alert("NIM ini sudah terdaftar! Langsung login saja Mas.");
        setIsLoading(false);
        return;
      }

      const newUser: UserProfile = {
        nim: nimInput,
        name: nameInput,
        password: passwordInput,
        jurusan: jurusanInput,
        uid: firebaseUser.uid
      };

      await setDoc(userDocRef, newUser);
      
      setCurrentUser(newUser);
      setView('main');
      alert("Pendaftaran BERHASIL! Selamat datang Mas Didi.");
    } catch (error: any) {
      console.error("Error Register:", error);
      alert(`GAGAL DAFTAR: ${error.message}\n\nCek konfigurasi Firebase dan Rules.`);
    }
    setIsLoading(false);
  };

  const handleLogin = async () => {
    if (!nimInput || !passwordInput) {
      alert("Isi NIM dan Password dulu Mas.");
      return;
    }
    if (!firebaseUser) {
       alert("Belum konek server, tunggu sebentar...");
       return;
    }

    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', nimInput);
      const snap = await getDoc(userDocRef);

      if (!snap.exists()) {
        alert("NIM tidak ditemukan. Daftar dulu ya!");
        setIsLoading(false);
        return;
      }

      const userData = snap.data() as UserProfile;
      if (userData.password !== passwordInput) {
        alert("Password salah Mas!");
        setIsLoading(false);
        return;
      }

      setCurrentUser(userData);
      setView('main');
    } catch (error: any) {
      console.error("Error Login:", error);
      alert(`Gagal Login: ${error.message}`);
    }
    setIsLoading(false);
  };

  // ... Fitur lainnya ...
  const sendFriendRequest = async () => {
    if (!currentUser) return;
    try {
        const targetDoc = await getDoc(doc(db, 'users', searchNim));
        if (!targetDoc.exists()) { showToast("NIM tidak ditemukan", "error"); return; }
        await addDoc(collection(db, 'requests'), {
        fromNim: currentUser.nim, fromName: currentUser.name, toNim: searchNim, status: 'pending', timestamp: serverTimestamp()
        });
        showToast("Permintaan terkirim!", "success"); setSearchNim(''); setActiveTab('chats');
    } catch (e) { showToast("Gagal kirim request", "error"); }
  };
  const respondToRequest = async (reqId: string, response: 'accepted' | 'rejected') => {
    try {
        const ref = doc(db, 'requests', reqId);
        await updateDoc(ref, { status: response });
        showToast(response === 'accepted' ? "Diterima!" : "Ditolak", "success");
    } catch (e) { showToast("Gagal respon", "error"); }
  };
  const sendMessage = async () => {
    if (!messageText.trim() || !currentUser || !activeChatNim) return;
    const chatId = [currentUser.nim, activeChatNim].sort().join('_');
    const text = messageText;
    setMessageText(''); 
    try {
        await addDoc(collection(db, `chats_${chatId}`), {
        senderNim: currentUser.nim, text: text, timestamp: serverTimestamp()
        });
    } catch (e) { showToast("Gagal kirim pesan", "error"); }
  };
  const getChatPartner = (f: FriendRequest) => {
    const isMeSender = f.fromNim === currentUser?.nim;
    return { nim: isMeSender ? f.toNim : f.fromNim, name: isMeSender ? `Mahasiswa (${f.toNim})` : f.fromName };
  };

  // --- RENDER UI ---
  if (view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl">
          
          {/* DEBUG STATUS BAR */}
          <div className={`mb-4 p-2 text-xs text-center rounded border ${isError ? 'bg-red-100 text-red-700 border-red-300' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
            <strong>Status System:</strong> {connectionStatus}
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">MahasiswaChat</h1>
            <p className="text-gray-500 text-sm">Koneksi Aman Sesama Mahasiswa</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NIM</label>
              <input type="text" value={nimInput} onChange={(e) => setNimInput(e.target.value.replace(/\D/g,''))} 
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="Masukkan NIM..." />
            </div>

            {view === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                  <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="Nama Kamu..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jurusan</label>
                  <input type="text" value={jurusanInput} onChange={(e) => setJurusanInput(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="Contoh: Informatika" />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="********" />
            </div>

            <button onClick={view === 'login' ? handleLogin : handleRegister} disabled={isLoading}
              className={`w-full font-bold py-3 rounded-lg transition-all flex justify-center items-center gap-2 ${isLoading ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
              {isLoading ? <Loader2 className="animate-spin" /> : (view === 'login' ? 'Masuk' : 'Daftar Akun')}
            </button>
            
            <div className="text-center mt-4">
              <button onClick={() => { setView(view === 'login' ? 'register' : 'login'); setNimInput(''); setPasswordInput(''); setNameInput(''); }}
                className="text-sm text-green-600 hover:underline">
                {view === 'login' ? 'Belum punya akun? Daftar pakai NIM' : 'Sudah punya akun? Login'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      <div className={`w-full md:w-1/3 bg-white border-r border-gray-200 flex flex-col ${activeChatNim ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">{currentUser?.name.charAt(0)}</div><div><h2 className="font-bold text-gray-800">{currentUser?.name}</h2><p className="text-xs text-gray-500">{currentUser?.nim}</p></div></div>
          <button onClick={() => setView('login')} className="text-gray-400 hover:text-red-500"><LogOut size={20} /></button>
        </div>
        <div className="flex border-b border-gray-200">
          <button onClick={() => setActiveTab('chats')} className={`flex-1 py-3 text-sm font-medium flex justify-center items-center gap-2 ${activeTab === 'chats' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}><MessageCircle size={18} /> Chat</button>
          <button onClick={() => setActiveTab('requests')} className={`flex-1 py-3 text-sm font-medium flex justify-center items-center gap-2 ${activeTab === 'requests' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}><Users size={18} /> Reqs {requests.length > 0 && <span className="bg-red-500 text-white text-xs px-1.5 rounded-full">{requests.length}</span>}</button>
          <button onClick={() => setActiveTab('add')} className={`flex-1 py-3 text-sm font-medium flex justify-center items-center gap-2 ${activeTab === 'add' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}><Plus size={18} /> Add</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {toast && <div className={`mb-2 p-2 text-center text-xs text-white rounded ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{toast.msg}</div>}
          {activeTab === 'add' && (
             <div className="p-4 text-center"><UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" /><h3 className="font-medium text-gray-700 mb-2">Tambah Teman Baru</h3><div className="flex gap-2"><input type="text" placeholder="Cari NIM Teman..." className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none" value={searchNim} onChange={(e) => setSearchNim(e.target.value.replace(/\D/g,''))} /><button onClick={sendFriendRequest} className="bg-green-600 text-white p-2 rounded-lg"><Send size={18} /></button></div></div>
          )}
          {activeTab === 'requests' && (
            <div className="space-y-2">{requests.length === 0 ? <div className="text-center p-8 text-gray-400 text-sm">Tidak ada permintaan.</div> : requests.map(req => (<div key={req.id} className="bg-white border rounded-lg p-3 shadow-sm flex justify-between items-center"><div><p className="font-bold text-sm text-gray-800">{req.fromName}</p><p className="text-xs text-gray-500">NIM: {req.fromNim}</p></div><div className="flex gap-2"><button onClick={() => respondToRequest(req.id, 'rejected')} className="p-2 bg-gray-100 text-gray-600 rounded-full"><X size={16} /></button><button onClick={() => respondToRequest(req.id, 'accepted')} className="p-2 bg-green-100 text-green-600 rounded-full"><Check size={16} /></button></div></div>))}</div>
          )}
          {activeTab === 'chats' && (
            <div className="space-y-1">{friends.length === 0 ? <div className="text-center p-8 text-gray-400 text-sm">Belum ada chat.</div> : friends.map(friend => { const partner = getChatPartner(friend); return (<div key={friend.id} onClick={() => { setActiveChatNim(partner.nim); setActiveChatName(partner.name); }} className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 hover:bg-gray-100 ${activeChatNim === partner.nim ? 'bg-green-50' : ''}`}><div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600"><User size={20} /></div><div className="flex-1 overflow-hidden"><h3 className="font-semibold text-gray-800 text-sm truncate">{partner.name}</h3></div></div>); })}</div>
          )}
        </div>
      </div>
      <div className={`flex-1 flex flex-col bg-[#e5ded8] ${!activeChatNim ? 'hidden md:flex' : 'flex'}`}>
        {!activeChatNim ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center opacity-70"><div className="bg-white p-6 rounded-full mb-4 shadow-sm"><MessageCircle size={48} className="text-green-500" /></div><h2 className="text-xl font-light mb-2">Selamat Datang di MahasiswaChat</h2></div>
        ) : (
          <>
            <div className="bg-gray-100 p-3 px-4 border-b border-gray-300 flex items-center gap-3 shadow-sm"><button onClick={() => setActiveChatNim(null)} className="md:hidden text-gray-600"><ArrowLeft size={24} /></button><div className="w-9 h-9 rounded-full bg-white flex items-center justify-center border"><User size={20} className="text-gray-500" /></div><div className="flex-1"><h3 className="font-bold text-gray-800 text-sm">{activeChatName}</h3><p className="text-xs text-gray-500">{activeChatNim}</p></div></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">{messages.map((msg) => { const isMe = msg.senderNim === currentUser?.nim; return (<div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm relative ${isMe ? 'bg-[#d9fdd3] text-gray-800 rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}`}><p>{msg.text}</p><span className="text-[10px] text-gray-500 block text-right mt-1 opacity-70">{msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : <Clock size={10} className="inline" />}</span></div></div>); })}<div ref={dummyEndRef} /></div>
            <div className="p-3 bg-gray-100 flex items-center gap-2"><input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ketik pesan..." className="flex-1 px-4 py-2 rounded-full border border-gray-300 focus:outline-none text-sm" /><button onClick={sendMessage} disabled={!messageText.trim()} className={`p-2 rounded-full transition-colors ${messageText.trim() ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-500'}`}><Send size={20} /></button></div>
          </>
        )}
      </div>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.2); border-radius: 3px; }`}</style>
    </div>
  );
}