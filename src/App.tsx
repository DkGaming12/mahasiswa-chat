import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, User, Plus, Check, X, LogOut, 
  Search, Send, ArrowLeft, Camera as CameraIcon, Image as ImageIcon, Video as VideoIcon, Trash2, Loader2, Paperclip, CheckCheck 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDoc, 
  query, where, onSnapshot, addDoc, updateDoc, 
  serverTimestamp, orderBy, limit, writeBatch, getDocs // getDocs dan writeBatch ditambahkan
} from 'firebase/firestore';

// --- PENTING: DI LAPTOP, HAPUS TANDA '//' DI BAWAH INI JIKA INGIN MENGGUNAKAN KAMERA HP ---
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'; 

const firebaseConfig = {
  apiKey: "AIzaSyBK0be6JgLVWb71sspT8CLk3rbnzxjWnz4",
  authDomain: "mahasiswa-chat-25e5d.firebaseapp.com",
  projectId: "mahasiswa-chat-25e5d",
  storageBucket: "mahasiswa-chat-25e5d.firebasestorage.app",
  messagingSenderId: "991996803084"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- TYPES ---
interface UserProfile {
  nim: string; name: string; password?: string; uid: string; jurusan?: string; photoUrl?: string; 
}
interface UserStatus {
  id: string; userNim: string; userName: string; text: string; timestamp: any; photoUrl?: string; mediaUrl?: string; mediaType?: 'image' | 'video'; 
}
interface FriendRequest {
  id: string; fromNim: string; fromName: string; toNim: string; status: 'pending' | 'accepted' | 'rejected'; timestamp: any;
}
interface Message {
  id: string; senderNim: string; text: string; timestamp: any; mediaUrl?: string; mediaType?: 'image'|'video'|'audio'|'voice'; read?: boolean;
}

// --- COMPONENT CHAT ITEM (LOGIKA ALA WHATSAPP) ---
const ChatListItem = ({ friend, currentUser, onClick, isActive }: { friend: { nim: string, name: string, photoUrl: string, requestId: string }, currentUser: UserProfile, onClick: () => void, isActive: boolean }) => {
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser || !friend) return;

    const chatId = [currentUser.nim, friend.nim].sort().join('_');
    const q = query(collection(db, `chats_${chatId}`), orderBy('timestamp', 'desc'), limit(50));
    
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => d.data() as Message);
      if (msgs.length > 0) {
        setLastMsg(msgs[0]); // Pesan paling baru
        // Hitung pesan yang dikirim TEMAN dan status read-nya false
        const unread = msgs.filter(m => m.senderNim !== currentUser.nim && !m.read).length;
        setUnreadCount(unread);
      }
    });
    return () => unsub();
  }, [friend, currentUser]);

  if (!friend) return null;

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    // Format Jam:Menit (Contoh: 14:30)
    return new Date(timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
  };

  return (
    <div onClick={onClick} className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${isActive ? 'bg-green-50' : ''}`}>
      <div className="relative">
        <img src={friend.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.name}`} className="w-12 h-12 rounded-full bg-gray-200 border border-gray-200 object-cover" alt="avatar" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold text-gray-900 text-sm truncate">{friend.name}</h3>
          {/* Waktu berwarna Hijau jika ada pesan baru */}
          <span className={`text-[11px] ${unreadCount > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
            {lastMsg ? formatTime(lastMsg.timestamp) : ''}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1 text-sm text-gray-500 truncate pr-2 w-full">
            {/* Tanda Centang (Hanya jika pesan terakhir dari SAYA) */}
            {lastMsg && lastMsg.senderNim === currentUser?.nim && (
              <span>
                {lastMsg.read ? (
                  <CheckCheck size={16} className="text-blue-500" /> // Biru (Dibaca)
                ) : (
                  <CheckCheck size={16} className="text-gray-400" /> // Abu (Terkirim)
                )}
              </span>
            )}
            
            <span className={`truncate ${unreadCount > 0 ? 'font-bold text-gray-800' : ''}`}>
              {lastMsg ? (lastMsg.mediaUrl ? (lastMsg.mediaType === 'image' ? '📷 Foto' : '🎥 Video') : lastMsg.text) : 'Ketuk untuk chat'}
            </span>
          </div>
          
          {/* Lingkaran Hijau (Counter) */}
          {unreadCount > 0 && (
            <div className="min-w-[20px] h-5 bg-green-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1.5 shadow-sm">
              {unreadCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sysStatus, setSysStatus] = useState<string>('Connecting...');
  const [isError, setIsError] = useState(false);

  const [view, setView] = useState<'login' | 'register' | 'main'>('login');
  const [tab, setTab] = useState<'chats' | 'status' | 'add' | 'requests'>('chats');
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatName, setChatName] = useState<string>('');
  const [currentFriendRequestId, setCurrentFriendRequestId] = useState<string | null>(null); // State baru untuk ID permintaan pertemanan
  
  const [reqs, setReqs] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [feeds, setFeeds] = useState<UserStatus[]>([]);
  
  const [form, setForm] = useState({ nim: '', pass: '', name: '', major: '' });
  const [search, setSearch] = useState('');
  const [txt, setTxt] = useState('');
  
  const [statusTxt, setStatusTxt] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [MediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const dummyRef = useRef<HTMLDivElement>(null);
  const statusFileRef = useRef<HTMLInputElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const profileFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      try { await signInAnonymously(auth); setSysStatus("Online ✅"); setIsError(false); } 
      catch (err: any) { setSysStatus(`Offline: ${err.message}`); setIsError(true); }
    };
    init();
    return onAuthStateChanged(auth, (u) => { if (u) setUser(u); });
  }, []);

  useEffect(() => {
    if (!profile) return;
    const unsubReq = onSnapshot(query(collection(db, 'requests'), where('toNim', '==', profile.nim)), (snap) => setReqs(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)).filter(r => r.status === 'pending')));
    const unsubFriend = onSnapshot(query(collection(db, 'requests'), where('status', '==', 'accepted')), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
      setFriends(all.filter(r => r.fromNim === profile.nim || r.toNim === profile.nim));
    });
    const unsubFeed = onSnapshot(query(collection(db, 'statuses'), orderBy('timestamp', 'desc'), limit(20)), (snap) => setFeeds(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserStatus))));
    return () => { unsubReq(); unsubFriend(); unsubFeed(); };
  }, [profile]);

  useEffect(() => {
    if (!profile || !chatId) return;
    const id = [profile.nim, chatId].sort().join('_');
    
    const unsub = onSnapshot(query(collection(db, `chats_${id}`), orderBy('timestamp', 'asc'), limit(50)), (snap) => {
      const loadedMsgs = snap.docs.map(d => (d.data() as Message));
      setMsgs(loadedMsgs);
      setTimeout(() => dummyRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      
      const unreadMsgs = snap.docs.filter(doc => { 
        const m = doc.data() as Message; 
        return m.senderNim !== profile.nim && !m.read; 
      });

      if (unreadMsgs.length > 0) {
        const batch = writeBatch(db);
        unreadMsgs.forEach(doc => batch.update(doc.ref, { read: true }));
        batch.commit().catch(console.error);
      }
    });
    return () => unsub();
  }, [profile, chatId]);

  // --- FILE HANDLERS ---
  const readFile = (file: File, callback: (base64: string, type: 'image'|'video') => void) => {
    if (file.size > 1.5 * 1024 * 1024) return alert("File terlalu besar (Max 1.5MB)");
    const reader = new FileReader();
    reader.onload = (ev) => callback(ev.target?.result as string, file.type.startsWith('video') ? 'video' : 'image');
    reader.readAsDataURL(file);
  };

  const handleProfileFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && profile) readFile(f, async (b64) => { 
      await updateDoc(doc(db, 'users', profile.nim), { photoUrl: b64 }); 
      setProfile({ ...profile, photoUrl: b64 }); 
      setEditMode(false); 
      alert("Foto profil diganti!"); 
    });
  };

  const triggerChangeProfile = () => {
    profileFileRef.current?.click();
  };

  const handleStatusFile = (e: React.ChangeEvent<HTMLInputElement>) => { 
    const f = e.target.files?.[0]; 
    if (f) readFile(f, (b64, type) => { setPreview(b64); setMediaType(type); }); 
  };
  
  const sendStatus = async () => {
    if ((!statusTxt.trim() && !preview) || !profile) return;
    try {
      await addDoc(collection(db, 'statuses'), { userNim: profile.nim, userName: profile.name, text: statusTxt, timestamp: serverTimestamp(), photoUrl: profile.photoUrl || '', mediaUrl: preview || null, mediaType: MediaType || null });
      setStatusTxt(''); setPreview(null); setMediaType(null);
    } catch (e) { alert("Gagal upload status"); }
  };

  const handleChatFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && profile && chatId) readFile(f, async (b64, type) => { 
      const id = [profile.nim, chatId].sort().join('_'); 
      await addDoc(collection(db, `chats_${id}`), { senderNim: profile.nim, text: '', timestamp: serverTimestamp(), mediaUrl: b64, mediaType: type, read: false }); 
    });
  };

  const takeChatPhoto = () => {
    // Di web, ini adalah fallback untuk membuka file input.
    chatFileRef.current?.click();
  };

  // --- AUTH ---
  const doAuth = async (isReg: boolean) => {
    if (!form.nim || !form.pass || (isReg && !form.name)) return alert("Lengkapi data");
    setLoading(true);
    try {
      const ref = doc(db, 'users', form.nim); const snap = await getDoc(ref);
      if (isReg) {
        if (snap.exists()) throw new Error("NIM sudah ada");
        const data: UserProfile = { nim: form.nim, name: form.name, password: form.pass, jurusan: form.major, uid: user.uid, photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${form.name}` };
        await setDoc(ref, data); setProfile(data);
      } else {
        if (!snap.exists()) throw new Error("NIM tidak ditemukan");
        const data = snap.data() as UserProfile; if (data.password !== form.pass) throw new Error("Password salah");
        setProfile(data);
      }
      setView('main');
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  // --- FITUR ANTI-SPAM PERMINTAAN PERTEMANAN ---
  const sendReq = async () => {
    if (!search || !profile || search === profile.nim) return;
    setLoading(true);

    try {
      // 1. Cek apakah NIM tujuan ada
      const target = await getDoc(doc(db, 'users', search));
      if (!target.exists()) {
        alert("User tidak ditemukan");
        setLoading(false);
        return;
      }

      // 2. Cek apakah sudah ada permintaan (pending atau accepted)
      const nim1 = profile.nim;
      const nim2 = search;

      const existingQuery = query(
        collection(db, 'requests'),
        where('status', 'in', ['pending', 'accepted']),
        where('toNim', 'in', [nim1, nim2]),
        where('fromNim', 'in', [nim1, nim2])
      );

      const existingSnap = await getDocs(existingQuery);

      if (!existingSnap.empty) {
        alert("Permintaan pertemanan sudah dikirim atau Anda sudah berteman.");
        setSearch('');
        setTab('chats');
        setLoading(false);
        return;
      }

      // 3. Kirim permintaan baru
      await addDoc(collection(db, 'requests'), { 
        fromNim: profile.nim, 
        fromName: profile.name, 
        toNim: search, 
        status: 'pending', 
        timestamp: serverTimestamp() 
      });
      
      setSearch(''); 
      setTab('chats'); 
      alert("Request terkirim"); 

    } catch (e: any) { 
      alert(e.message || "Gagal mengirim permintaan."); 
    }
    setLoading(false);
  };
  
  const reply = async (id: string, status: 'accepted'|'rejected') => await updateDoc(doc(db, 'requests', id), { status });
  
  const send = async () => {
    if (!txt.trim() || !chatId || !profile) return;
    const id = [profile.nim, chatId].sort().join('_');
    const t = txt; setTxt('');
    await addDoc(collection(db, `chats_${id}`), { senderNim: profile.nim, text: t, timestamp: serverTimestamp(), read: false });
  };

  // --- FITUR HAPUS CHAT ---
  const deleteChat = async (friendNim: string, requestId: string) => {
    if (!profile || !friendNim || !requestId) return;

    if (!window.confirm(`Yakin ingin menghapus chat dengan ${chatName}? Catatan pertemanan dan pesan akan hilang permanen.`)) {
        return;
    }
    
    setLoading(true);
    try {
        const batch = writeBatch(db);
        const chatColId = [profile.nim, friendNim].sort().join('_');
        const chatColRef = collection(db, `chats_${chatColId}`);
        
        // 1. Hapus semua pesan di koleksi chat (ambil 50 dokumen pertama sebagai simulasi)
        const q = query(chatColRef, limit(50));
        const messagesSnapshot = await getDocs(q);
        
        if (messagesSnapshot.size > 0) {
            messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        }

        // 2. Hapus record permintaan pertemanan (accepted)
        batch.delete(doc(db, 'requests', requestId));

        await batch.commit();

        setChatId(null);
        setChatName('');
        setCurrentFriendRequestId(null);

        alert("Chat berhasil dihapus.");

        // Pemberitahuan tambahan untuk koleksi besar
        if (messagesSnapshot.size === 50) {
             alert("Perhatian: Mungkin masih ada pesan lama yang tersisa. Pada aplikasi nyata, fitur ini memerlukan Cloud Function untuk menghapus seluruh koleksi secara aman.");
        }

    } catch (error) {
        console.error("Gagal menghapus chat:", error);
        alert("Gagal menghapus chat. Cek konsol untuk detail.");
    }
    setLoading(false);
  };

  const Avatar = ({ seed, url }: { seed: string, url?: string }) => ( <img src={url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`} className="w-10 h-10 rounded-full bg-gray-200 object-cover border" alt="avt" /> );

  if (view !== 'main') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg">
          <div className={`mb-4 p-2 text-xs text-center rounded ${isError?'bg-red-100 text-red-600':'bg-green-50 text-green-600'}`}>{sysStatus}</div>
          <div className="text-center mb-6"><div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><MessageCircle className="text-white w-8 h-8"/></div><h1 className="text-2xl font-bold">MahasiswaChat</h1></div>
          <div className="space-y-3">
            <input className="w-full px-4 py-2 border rounded-lg" value={form.nim} onChange={e=>setForm({...form, nim:e.target.value.replace(/\D/g,'')})} placeholder="NIM" />
            {view === 'register' && (<><input className="w-full px-4 py-2 border rounded-lg" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Nama" /><input className="w-full px-4 py-2 border rounded-lg" value={form.major} onChange={e=>setForm({...form, major:e.target.value})} placeholder="Jurusan" /></>)}
            <input type="password" className="w-full px-4 py-2 border rounded-lg" value={form.pass} onChange={e=>setForm({...form, pass:e.target.value})} placeholder="Password" />
            <button onClick={()=>doAuth(view==='register')} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">{loading?<Loader2 className="animate-spin"/>:(view==='login'?'Masuk':'Daftar')}</button>
            <button onClick={()=>setView(view==='login'?'register':'login')} className="w-full text-sm text-green-600 hover:underline mt-2">{view==='login'?'Buat Akun Baru':'Sudah punya akun?'}</button>
            <p className="text-[10px] text-center text-gray-500 font-medium">UIN K.H. Abdurrahman Wahid Pekalongan</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <input type="file" ref={profileFileRef} className="hidden" accept="image/*" onChange={handleProfileFile} />
      <input type="file" ref={statusFileRef} className="hidden" accept="image/*,video/*" onChange={handleStatusFile} />
      <input type="file" ref={chatFileRef} className="hidden" accept="image/*,video/*" onChange={handleChatFile} />

      <div className={`w-full md:w-1/3 bg-white border-r flex flex-col ${chatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEditMode(!editMode)}>
            <Avatar seed={profile?.name||''} url={profile?.photoUrl} />
            <div><h2 className="font-bold text-sm">{profile?.name}</h2><p className="text-xs text-gray-500">{profile?.nim}</p></div>
          </div>
          <button onClick={() => setView('login')} className="text-gray-400"><LogOut size={20}/></button>
        </div>

        {editMode && (
          <div className="p-4 bg-green-50 border-b space-y-2">
            <button onClick={triggerChangeProfile} className="w-full bg-white border border-green-600 text-green-600 py-2 rounded text-sm flex justify-center gap-2 hover:bg-green-100"><ImageIcon size={16}/> Ganti Foto Profil</button>
          </div>
        )}
        
        <div className="flex border-b bg-white">
          {['chats', 'status', 'add', 'requests'].map(t => (
            <button key={t} onClick={() => setTab(t as any)} className={`flex-1 py-3 text-xs font-bold uppercase ${tab===t?'text-green-600 border-b-2 border-green-600' : 'text-gray-400'}`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {tab === 'chats' && (
            <div>
              {friends.length === 0 ? <div className="text-center p-8 text-gray-400 text-sm">Belum ada chat.</div> : friends.map(f => {
                const isMeFrom = f.fromNim === profile?.nim;
                const friendNim = isMeFrom ? f.toNim : f.fromNim;
                const friendName = isMeFrom ? `Mahasiswa ${f.toNim}` : f.fromName;
                const friendPhotoUrl = f.photoUrl;

                const p = { nim: friendNim, name: friendName, photoUrl: friendPhotoUrl, requestId: f.id };
                
                return (
                  <ChatListItem 
                    key={f.id} 
                    friend={p} 
                    currentUser={profile} 
                    onClick={() => { 
                      setChatId(p.nim); 
                      setChatName(p.name); 
                      setCurrentFriendRequestId(p.requestId); // Simpan ID request
                    }}
                    isActive={chatId === p.nim}
                  />
                )
              })}
            </div>
          )}

          {tab === 'status' && (
            <div>
              <div className="p-4 border-b bg-gray-50 space-y-3">
                <div className="flex gap-3"><Avatar seed={profile?.name||''} url={profile?.photoUrl} /><input className="flex-1 bg-transparent text-sm outline-none" placeholder="Buat status..." value={statusTxt} onChange={e=>setStatusTxt(e.target.value)} /></div>
                {preview && <div className="relative bg-black rounded-lg h-32 flex justify-center items-center">{MediaType==='video'?<video src={preview} controls className="h-full"/>:<img src={preview} className="h-full object-contain" alt="pv"/>}<button onClick={()=>{setPreview(null);setMediaType(null)}} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><X size={12}/></button></div>}
                <div className="flex justify-between pt-2">
                  <div className="flex gap-2"><button onClick={()=>statusFileRef.current?.click()} className="text-gray-500"><ImageIcon size={20}/></button></div>
                  <button onClick={sendStatus} disabled={!statusTxt && !preview} className="bg-green-600 text-white px-4 py-1 rounded-full text-xs font-bold">KIRIM</button>
                </div>
              </div>
              <div className="p-2 space-y-4">{feeds.map(s => (<div key={s.id} className="flex gap-3 p-2 border-b"><div className="p-0.5 border-2 border-green-500 rounded-full h-fit"><Avatar seed={s.userName} url={s.photoUrl} /></div><div className="flex-1"><h4 className="font-bold text-sm">{s.userName}</h4><p className="text-xs text-gray-400 mb-2">{s.timestamp?.seconds ? new Date(s.timestamp.seconds*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Just now'}</p>{s.mediaUrl && <div className="mb-2 bg-black rounded h-48 flex justify-center">{s.mediaType==='video'?<video src={s.mediaUrl} controls className="h-full"/>:<img src={s.mediaUrl} className="h-full object-contain" alt="c"/>}</div>}<p className="text-sm">{s.text}</p></div></div>))}</div>
            </div>
          )}

          {tab === 'add' && (<div className="p-4 flex gap-2"><input className="flex-1 border rounded px-3 text-sm" placeholder="Cari NIM..." value={search} onChange={e=>setSearch(e.target.value)} /><button onClick={sendReq} disabled={loading} className="bg-green-600 text-white p-2 rounded"><Send size={18}/></button></div>)}
          {tab === 'requests' && reqs.map(r => (<div key={r.id} className="p-3 border-b flex justify-between items-center"><div><p className="font-bold text-sm">{r.fromName}</p><p className="text-xs">{r.fromNim}</p></div><div className="flex gap-2"><button onClick={()=>reply(r.id,'rejected')} className="text-red-500"><X/></button><button onClick={()=>reply(r.id,'accepted')} className="text-green-500"><Check/></button></div></div>))}
        </div>
      </div>

      {/* CHAT ROOM (Tampilan WA Style) */}
      <div className={`flex-1 flex flex-col bg-[#e5ded8] ${!chatId ? 'hidden md:flex' : 'flex'}`}>
        {!chatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><p>Pilih teman untuk memulai percakapan</p></div>
        ) : (
          <>
            <div className="bg-gray-100 p-2 border-b flex items-center gap-3 shadow-sm">
              <button onClick={() => { setChatId(null); setCurrentFriendRequestId(null); }} className="md:hidden"><ArrowLeft/></button>
              <Avatar seed={chatName} />
              <div className="flex-1">
                <h3 className="font-bold text-sm">{chatName}</h3>
                <p className="text-xs text-gray-500">Online</p>
              </div>
              {/* Tombol Hapus Chat Baru */}
              <button 
                onClick={() => deleteChat(chatId, currentFriendRequestId!)} 
                disabled={loading}
                className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors"
                title="Hapus Chat"
              >
                {loading && <Loader2 className="animate-spin w-5 h-5 text-gray-500"/>}
                {!loading && <Trash2 size={20}/>}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {msgs.map(m => (
                <div key={m.id} className={`flex ${m.senderNim===profile?.nim?'justify-end':'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm shadow-sm ${m.senderNim===profile?.nim?'bg-[#d9fdd3]':'bg-white'}`}>
                    {m.mediaUrl && <div className="mb-1 rounded overflow-hidden">{m.mediaType === 'video' ? <video src={m.mediaUrl} controls className="max-w-full max-h-60"/> : <img src={m.mediaUrl} className="max-w-full max-h-60" alt="media"/>}</div>}
                    {m.text && <p>{m.text}</p>}
                    
                    {/* FOOTER PESAN: Jam & Centang */}
                    <div className="flex justify-end items-center gap-1 mt-1">
                      <span className="text-[10px] text-gray-500">{m.timestamp?.seconds?new Date(m.timestamp.seconds*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'...'}</span>
                      {/* Tampilkan Centang Cuma di Pesan Kita */}
                      {m.senderNim === profile?.nim && (
                        m.read ? 
                        <CheckCheck size={14} className="text-blue-500" /> : // Dibaca (Biru)
                        <CheckCheck size={14} className="text-gray-400" />   // Terkirim (Abu)
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={dummyRef}/>
            </div>
            <div className="p-2 bg-gray-100 flex gap-2 items-center">
              <button onClick={() => chatFileRef.current?.click()} className="text-gray-500 hover:text-green-600"><Paperclip size={20}/></button>
              <button onClick={takeChatPhoto} className="text-gray-500 hover:text-green-600"><CameraIcon size={20}/></button>
              <input className="flex-1 px-4 py-2 rounded-full border-none text-sm" value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Tulis pesan..." />
              <button onClick={send} className="bg-green-600 text-white p-2 rounded-full"><Send size={18}/></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}