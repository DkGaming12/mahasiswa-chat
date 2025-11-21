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

// --- KONFIGURASI FIREBASE (FINAL & BERSIH) ---
const firebaseConfig = {
  apiKey: "AIzaSyBK0be6JgLVWb71sspT8CLk3rbnzxjWnz4",
  authDomain: "mahasiswa-chat-25e5d.firebaseapp.com",
  projectId: "mahasiswa-chat-25e5d",
  storageBucket: "mahasiswa-chat-25e5d.firebasestorage.app",
  messagingSenderId: "991996803084"
  // appId dihapus karena opsional dan sering bikin error jika format salah
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
  
  // Status Sistem
  const [connectionStatus, setConnectionStatus] = useState<string>('Menghubungkan...');
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

  // --- 1. CEK KONEKSI SERVER ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        console.log("Sukses login anonymous");
        setConnectionStatus("Terhubung ke Server ✅");
        setIsError(false);
      } catch (error: any) {
        console.error("Gagal Auth:", error);
        setConnectionStatus(`Gagal Konek: ${error.message}`);
        setIsError(true);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFirebaseUser(user);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. DATA LISTENERS ---
  useEffect(() => {
    if (!currentUser) return;

    const qReq = query(collection(db, 'requests'), where('toNim', '==', currentUser.nim));
    const unsubReq = onSnapshot(qReq, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)).filter(r => r.status === 'pending'));
    });

    const qFriend = query(collection(db, 'requests'), where('status', '==', 'accepted'));
    const unsubFriend = onSnapshot(qFriend, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
      setFriends(all.filter(r => r.fromNim === currentUser.nim || r.toNim === currentUser.nim));
    });

    return () => { unsubReq(); unsubFriend(); };
  }, [currentUser]);

  // --- 3. CHAT LISTENER ---
  useEffect(() => {
    if (!currentUser || !activeChatNim) return;
    const chatId = [currentUser.nim, activeChatNim].sort().join('_');
    const qChat = query(collection(db, `chats_${chatId}`), orderBy('timestamp', 'asc'), limit(100));
    
    const unsubChat = onSnapshot(qChat, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
      setTimeout(() => dummyEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubChat();
  }, [currentUser, activeChatNim]);

  // --- ACTIONS ---
  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRegister = async () => {
    if (!nimInput || !nameInput || !passwordInput) {
      alert("Mohon isi semua data (NIM, Nama, Password)");
      return;
    }
    if (!firebaseUser) {
      alert("Belum terhubung ke server. Cek koneksi internet.");
      return;
    }

    setIsLoading(true);
    try {
      const userRef = doc(db, 'users', nimInput);
      const snap = await getDoc(userRef);
      
      if (snap.exists()) {
        alert("NIM sudah terdaftar. Silakan login.");
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

      await setDoc(userRef, newUser);
      setCurrentUser(newUser);
      setView('main');
      alert(`Selamat datang, ${nameInput}!`);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal Daftar: ${err.message}`);
    }
    setIsLoading(false);
  };

  const handleLogin = async () => {
    if (!nimInput || !passwordInput) {
      alert("Isi NIM dan Password");
      return;
    }
    setIsLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', nimInput));
      if (!snap.exists()) {
        alert("NIM tidak ditemukan. Daftar dulu ya.");
        setIsLoading(false);
        return;
      }
      const data = snap.data() as UserProfile;
      if (data.password !== passwordInput) {
        alert("Password salah!");
        setIsLoading(false);
        return;
      }
      setCurrentUser(data);
      setView('main');
    } catch (err: any) {
      console.error(err);
      alert(`Gagal Login: ${err.message}`);
    }
    setIsLoading(false);
  };

  const sendRequest = async () => {
    if (!searchNim || !currentUser) return;
    if (searchNim === currentUser.nim) return alert("Gak bisa add diri sendiri");
    
    try {
      const target = await getDoc(doc(db, 'users', searchNim));
      if (!target.exists()) return alert("NIM teman tidak ditemukan");
      
      await addDoc(collection(db, 'requests'), {
        fromNim: currentUser.nim, fromName: currentUser.name, toNim: searchNim, status: 'pending', timestamp: serverTimestamp()
      });
      alert("Request terkirim!");
      setSearchNim('');
      setActiveTab('chats');
    } catch (e) { alert("Gagal kirim request"); }
  };

  const replyRequest = async (id: string, status: 'accepted'|'rejected') => {
    await updateDoc(doc(db, 'requests', id), { status });
  };

  const sendMsg = async () => {
    if (!messageText.trim() || !activeChatNim || !currentUser) return;
    const chatId = [currentUser.nim, activeChatNim].sort().join('_');
    const txt = messageText;
    setMessageText('');
    await addDoc(collection(db, `chats_${chatId}`), {
      senderNim: currentUser.nim, text: txt, timestamp: serverTimestamp()
    });
  };

  // --- RENDER ---
  if (view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl">
          
          {/* STATUS BAR */}
          <div className={`mb-4 p-2 text-xs text-center rounded ${isError ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            Status: <strong>{connectionStatus}</strong>
          </div>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">MahasiswaChat</h1>
            <p className="text-gray-500 text-sm">UIN Gus Dur Pekalongan</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">NIM</label>
              <input className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" 
                value={nimInput} onChange={e => setNimInput(e.target.value.replace(/\D/g,''))} placeholder="Contoh: 12345678" />
            </div>

            {view === 'register' && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nama Lengkap</label>
                  <input className="w-full px-4 py-2 border rounded-lg outline-none" 
                    value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Nama Lengkap Kamu" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Jurusan</label>
                  <input className="w-full px-4 py-2 border rounded-lg outline-none" 
                    value={jurusanInput} onChange={e => setJurusanInput(e.target.value)} placeholder="Contoh: Informatika" />
                </div>
              </>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700">Password</label>
              <input type="password" className="w-full px-4 py-2 border rounded-lg outline-none" 
                value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="******" />
            </div>

            <button onClick={view === 'login' ? handleLogin : handleRegister} disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2">
              {isLoading ? <Loader2 className="animate-spin" /> : (view === 'login' ? 'Masuk' : 'Daftar Akun')}
            </button>

            <div className="text-center mt-4">
              <button onClick={() => setView(view === 'login' ? 'register' : 'login')} className="text-sm text-green-600 hover:underline">
                {view === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Login'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TAMPILAN CHAT (MAIN)
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* SIDEBAR */}
      <div className={`w-full md:w-1/3 bg-white border-r flex flex-col ${activeChatNim ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold">{currentUser?.name[0]}</div>
            <div><h2 className="font-bold">{currentUser?.name}</h2><p className="text-xs text-gray-500">{currentUser?.nim}</p></div>
          </div>
          <button onClick={() => setView('login')} className="text-gray-400"><LogOut size={20}/></button>
        </div>
        
        <div className="flex border-b">
          {['chats', 'requests', 'add'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} 
              className={`flex-1 py-3 text-sm font-medium capitalize ${activeTab === tab ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}>
              {tab} {tab === 'requests' && requests.length > 0 && `(${requests.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {activeTab === 'add' && (
            <div className="p-4 text-center space-y-2">
              <h3 className="font-medium">Tambah Teman</h3>
              <div className="flex gap-2">
                <input className="flex-1 border rounded-lg px-3 py-2" placeholder="Cari NIM..." value={searchNim} onChange={e => setSearchNim(e.target.value.replace(/\D/g,''))} />
                <button onClick={sendRequest} className="bg-green-600 text-white p-2 rounded-lg"><Send size={18}/></button>
              </div>
            </div>
          )}
          
          {activeTab === 'requests' && requests.map(r => (
            <div key={r.id} className="bg-white border p-3 rounded-lg flex justify-between items-center mb-2">
              <div><p className="font-bold text-sm">{r.fromName}</p><p className="text-xs text-gray-500">{r.fromNim}</p></div>
              <div className="flex gap-2">
                <button onClick={() => replyRequest(r.id, 'rejected')} className="p-1 bg-gray-100 rounded"><X size={16}/></button>
                <button onClick={() => replyRequest(r.id, 'accepted')} className="p-1 bg-green-100 text-green-600 rounded"><Check size={16}/></button>
              </div>
            </div>
          ))}

          {activeTab === 'chats' && friends.map(f => {
            const partner = f.fromNim === currentUser?.nim ? {nim: f.toNim, name: `Mahasiswa ${f.toNim}`} : {nim: f.fromNim, name: f.fromName};
            return (
              <div key={f.id} onClick={() => { setActiveChatNim(partner.nim); setActiveChatName(partner.name); }} 
                className="p-3 flex items-center gap-3 hover:bg-gray-100 cursor-pointer rounded-lg mb-1">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center"><User size={20}/></div>
                <div><h3 className="font-semibold text-sm">{partner.name}</h3><p className="text-xs text-gray-500">{partner.nim}</p></div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CHAT ROOM */}
      <div className={`flex-1 flex flex-col bg-[#e5ded8] ${!activeChatNim ? 'hidden md:flex' : 'flex'}`}>
        {!activeChatNim ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageCircle size={48} className="mb-2"/>
            <p>Pilih teman untuk mulai chat</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-100 p-3 border-b flex items-center gap-3">
              <button onClick={() => setActiveChatNim(null)} className="md:hidden"><ArrowLeft/></button>
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center"><User size={16}/></div>
              <div className="flex-1"><h3 className="font-bold text-sm">{activeChatName}</h3><p className="text-xs text-gray-500">{activeChatNim}</p></div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.senderNim === currentUser?.nim ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${m.senderNim === currentUser?.nim ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                    <p>{m.text}</p>
                    <span className="text-[10px] text-gray-500 block text-right">{m.timestamp?.seconds ? new Date(m.timestamp.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...'}</span>
                  </div>
                </div>
              ))}
              <div ref={dummyEndRef}/>
            </div>

            <div className="p-3 bg-gray-100 flex gap-2">
              <input className="flex-1 px-4 py-2 rounded-full border outline-none text-sm" 
                value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} placeholder="Ketik pesan..." />
              <button onClick={sendMsg} className="bg-green-600 text-white p-2 rounded-full"><Send size={20}/></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}