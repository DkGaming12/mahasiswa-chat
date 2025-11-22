import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, User, Plus, Check, X, LogOut, 
  Search, Send, ArrowLeft, Camera, Image as ImageIcon, Video as VideoIcon, Trash2, Loader2 
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
// import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'; 
// ^^^ UNCOMMENT BARIS DI ATAS SETELAH 'npm install @capacitor/camera'

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

// Types
interface UserProfile {
  nim: string;
  name: string;
  password?: string; 
  uid: string;
  jurusan?: string;
  photoUrl?: string; 
}

interface UserStatus {
  id: string;
  userNim: string;
  userName: string;
  text: string;
  timestamp: any;
  photoUrl?: string;
  mediaUrl?: string; 
  mediaType?: 'image' | 'video'; 
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

// Mock camera untuk fallback jika plugin belum load/di web
const MockCamera = {
  getPhoto: async () => { throw new Error("Camera not available"); }
};

// Helper agar tidak error saat compile di web, nanti di HP pakai 'Camera' asli
const getCamera = () => {
  // @ts-ignore
  return (typeof Camera !== 'undefined') ? Camera : MockCamera;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sysStatus, setSysStatus] = useState<string>('Connecting...');
  const [isError, setIsError] = useState(false);

  const [view, setView] = useState<'login' | 'register' | 'main'>('login');
  const [tab, setTab] = useState<'chats' | 'status' | 'requests' | 'add'>('chats');
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatName, setChatName] = useState<string>('');
  
  const [reqs, setReqs] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [feeds, setFeeds] = useState<UserStatus[]>([]);
  
  // Form states
  const [form, setForm] = useState({ nim: '', pass: '', name: '', major: '' });
  const [search, setSearch] = useState('');
  const [txt, setTxt] = useState('');
  
  // Status creation
  const [statusTxt, setStatusTxt] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [MediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const dummyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null); 

  // Auth Init
  useEffect(() => {
    const init = async () => {
      try {
        await signInAnonymously(auth);
        setSysStatus("Online ✅");
        setIsError(false);
      } catch (err: any) {
        setSysStatus(`Offline: ${err.message}`);
        setIsError(true);
      }
    };
    init();
    return onAuthStateChanged(auth, (u) => { if (u) setUser(u); });
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!profile) return;

    const unsubReq = onSnapshot(
      query(collection(db, 'requests'), where('toNim', '==', profile.nim)), 
      (snap) => setReqs(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)).filter(r => r.status === 'pending'))
    );

    const unsubFriend = onSnapshot(
      query(collection(db, 'requests'), where('status', '==', 'accepted')), 
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest));
        setFriends(all.filter(r => r.fromNim === profile.nim || r.toNim === profile.nim));
      }
    );

    const unsubFeed = onSnapshot(
      query(collection(db, 'statuses'), orderBy('timestamp', 'desc'), limit(20)), 
      (snap) => setFeeds(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserStatus)))
    );

    return () => { unsubReq(); unsubFriend(); unsubFeed(); };
  }, [profile]);

  // Chat Listener
  useEffect(() => {
    if (!profile || !chatId) return;
    const id = [profile.nim, chatId].sort().join('_');
    
    return onSnapshot(
      query(collection(db, `chats_${id}`), orderBy('timestamp', 'asc'), limit(100)), 
      (snap) => {
        setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
        setTimeout(() => dummyRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    );
  }, [profile, chatId]);

  // Handlers
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 900 * 1024) return alert("File too large (max 900KB)");

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
      setMediaType(f.type.startsWith('video') ? 'video' : 'image');
    };
    reader.readAsDataURL(f);
  };

  const openPicker = (type: 'image' | 'video') => {
    if (fileRef.current) {
      fileRef.current.accept = type === 'video' ? 'video/*' : 'image/*';
      fileRef.current.click();
    }
  };

  const capture = async () => {
    try {
      // @ts-ignore
      const image = await getCamera().getPhoto({
        quality: 50,
        allowEditing: false,
        // @ts-ignore
        resultType: 'base64', // Fallback string if type not found
        // @ts-ignore
        source: 'camera',
        width: 500
      });
      if (image.dataUrl) {
        setPreview(image.dataUrl);
        setMediaType('image');
      }
    } catch (e) {
      // Fallback to file input if camera fails
      openPicker('image');
    }
  };

  const sendStatus = async () => {
    if ((!statusTxt.trim() && !preview) || !profile) return;
    try {
      await addDoc(collection(db, 'statuses'), {
        userNim: profile.nim,
        userName: profile.name,
        text: statusTxt,
        timestamp: serverTimestamp(),
        photoUrl: profile.photoUrl || '',
        mediaUrl: preview || null,
        mediaType: MediaType || null
      });
      setStatusTxt('');
      setPreview(null);
      setMediaType(null);
    } catch (e) { console.error(e); }
  };

  const updatePic = async () => {
    try {
      // @ts-ignore
      const image = await getCamera().getPhoto({ quality: 40, resultType: 'base64', width: 300 });
      if (image.dataUrl && profile) {
        await updateDoc(doc(db, 'users', profile.nim), { photoUrl: image.dataUrl });
        setProfile({ ...profile, photoUrl: image.dataUrl });
        setEditMode(false);
      }
    } catch (e) {
      // Fallback
      if (fileRef.current) {
         fileRef.current.accept = 'image/*';
         fileRef.current.onchange = (e: any) => {
            const f = e.target.files?.[0];
            if (f) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const b64 = ev.target?.result as string;
                    if (b64 && profile) {
                        await updateDoc(doc(db, 'users', profile.nim), { photoUrl: b64 });
                        setProfile({ ...profile, photoUrl: b64 });
                        setEditMode(false);
                    }
                };
                reader.readAsDataURL(f);
            }
            if(fileRef.current) fileRef.current.onchange = handleFile; // Reset
         };
         fileRef.current.click();
      }
    }
  };

  const doAuth = async (isReg: boolean) => {
    if (!form.nim || !form.pass || (isReg && !form.name)) return alert("Lengkapi data");
    if (!user) return alert("No connection");
    
    setLoading(true);
    try {
      const ref = doc(db, 'users', form.nim);
      const snap = await getDoc(ref);
      
      if (isReg) {
        if (snap.exists()) throw new Error("NIM sudah terdaftar");
        const data: UserProfile = { 
          nim: form.nim, 
          name: form.name, 
          password: form.pass, 
          jurusan: form.major, 
          uid: user.uid, 
          photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${form.name}` 
        };
        await setDoc(ref, data);
        setProfile(data);
      } else {
        if (!snap.exists()) throw new Error("NIM tidak ditemukan");
        const data = snap.data() as UserProfile;
        if (data.password !== form.pass) throw new Error("Password salah");
        setProfile(data);
      }
      setView('main');
    } catch (e: any) { alert(e.message); }
    setLoading(false);
  };

  const sendReq = async () => {
    if (!search || !profile || search === profile.nim) return;
    try {
      const target = await getDoc(doc(db, 'users', search));
      if (!target.exists()) return alert("User not found");
      await addDoc(collection(db, 'requests'), { fromNim: profile.nim, fromName: profile.name, toNim: search, status: 'pending', timestamp: serverTimestamp() });
      setSearch(''); setTab('chats'); alert("Sent!");
    } catch (e) { console.error(e); }
  };

  const reply = async (id: string, status: 'accepted'|'rejected') => { await updateDoc(doc(db, 'requests', id), { status }); };
  
  const send = async () => {
    if (!txt.trim() || !chatId || !profile) return;
    const id = [profile.nim, chatId].sort().join('_');
    const t = txt; setTxt('');
    await addDoc(collection(db, `chats_${id}`), { senderNim: profile.nim, text: t, timestamp: serverTimestamp() });
  };

  const Avatar = ({ seed, url }: { seed: string, url?: string }) => (
    <img src={url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`} className="w-10 h-10 rounded-full bg-gray-200 object-cover border" alt="avt" />
  );

  // --- VIEWS ---
  if (view !== 'main') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg">
          <div className={`mb-4 p-2 text-xs text-center rounded ${isError ? 'bg-red-100 text-red-600' : 'bg-green-50 text-green-600'}`}>{sysStatus}</div>
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><MessageCircle className="text-white w-8 h-8" /></div>
            <h1 className="text-2xl font-bold text-gray-800">MahasiswaChat</h1>
          </div>
          <div className="space-y-3">
            <input className="w-full px-4 py-2 border rounded-lg" value={form.nim} onChange={e => setForm({...form, nim: e.target.value.replace(/\D/g,'')})} placeholder="NIM" />
            {view === 'register' && (
              <>
                <input className="w-full px-4 py-2 border rounded-lg" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nama Lengkap" />
                <input className="w-full px-4 py-2 border rounded-lg" value={form.major} onChange={e => setForm({...form, major: e.target.value})} placeholder="Jurusan" />
              </>
            )}
            <input type="password" className="w-full px-4 py-2 border rounded-lg" value={form.pass} onChange={e => setForm({...form, pass: e.target.value})} placeholder="Password" />
            <button onClick={() => doAuth(view === 'register')} disabled={loading} className="w-full bg-green-600 text-white font-bold py-3 rounded-lg flex justify-center gap-2 hover:bg-green-700 transition-all">
              {loading ? <Loader2 className="animate-spin" /> : (view === 'login' ? 'Masuk' : 'Daftar')}
            </button>
            <button onClick={() => setView(view === 'login' ? 'register' : 'login')} className="w-full text-sm text-green-600 hover:underline mt-2">
              {view === 'login' ? 'Buat Akun Baru' : 'Sudah punya akun?'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <input type="file" ref={fileRef} className="hidden" onChange={handleFile} />

      {/* SIDEBAR */}
      <div className={`w-full md:w-1/3 bg-white border-r flex flex-col ${chatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEditMode(!editMode)}>
            <Avatar seed={profile?.name || ''} url={profile?.photoUrl} />
            <div><h2 className="font-bold text-sm">{profile?.name}</h2><p className="text-xs text-gray-500">{profile?.nim}</p></div>
          </div>
          <button onClick={() => setView('login')} className="text-gray-400 hover:text-red-500"><LogOut size={20}/></button>
        </div>

        {editMode && (
          <div className="p-4 bg-green-50 border-b space-y-2">
            <button onClick={updatePic} className="w-full bg-white border border-green-600 text-green-600 py-2 rounded text-sm flex justify-center gap-2">
              <Camera size={16}/> Ganti Foto
            </button>
          </div>
        )}
        
        <div className="flex border-b bg-white">
          {['chats', 'status', 'requests', 'add'].map(t => (
            <button key={t} onClick={() => setTab(t as any)} className={`flex-1 py-3 text-xs font-bold uppercase ${tab === t ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-400'}`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {tab === 'status' && (
            <div>
              <div className="p-4 border-b bg-gray-50 space-y-3">
                <div className="flex gap-3">
                  <Avatar seed={profile?.name || ''} url={profile?.photoUrl} />
                  <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Ada cerita apa?" value={statusTxt} onChange={e => setStatusTxt(e.target.value)} />
                </div>
                
                {preview && (
                  <div className="relative bg-black rounded-lg h-32 flex justify-center items-center">
                    {MediaType === 'video' ? <video src={preview} controls className="h-full"/> : <img src={preview} className="h-full object-contain" alt="pv"/>}
                    <button onClick={() => {setPreview(null); setMediaType(null)}} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><X size={12}/></button>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <div className="flex gap-3 text-gray-500">
                    <button onClick={() => openPicker('image')}><ImageIcon size={18}/></button>
                    <button onClick={() => openPicker('video')}><VideoIcon size={18}/></button>
                    <button onClick={capture}><Camera size={18}/></button>
                  </div>
                  <button onClick={sendStatus} disabled={!statusTxt && !preview} className="bg-green-600 text-white px-4 py-1 rounded-full text-xs font-bold">KIRIM</button>
                </div>
              </div>
              
              <div className="p-2 space-y-4">
                {feeds.map(s => (
                  <div key={s.id} className="flex gap-3 p-2 border-b">
                    <div className="p-0.5 border-2 border-green-500 rounded-full h-fit"><Avatar seed={s.userName} url={s.photoUrl} /></div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm">{s.userName}</h4>
                      <p className="text-xs text-gray-400 mb-2">{s.timestamp?.seconds ? new Date(s.timestamp.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Just now'}</p>
                      {s.mediaUrl && <div className="mb-2 bg-black rounded h-48 flex justify-center">{s.mediaType === 'video' ? <video src={s.mediaUrl} controls className="h-full"/> : <img src={s.mediaUrl} className="h-full object-contain" alt="c"/>}</div>}
                      <p className="text-sm">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'chats' && friends.map(f => {
            const p = f.fromNim === profile?.nim ? {id: f.toNim, n: f.toNim} : {id: f.fromNim, n: f.fromName};
            return (
              <div key={f.id} onClick={() => { setChatId(p.id); setChatName(p.n); }} className="p-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer border-b">
                <Avatar seed={p.n} />
                <div><h3 className="font-semibold text-sm">{p.n}</h3><p className="text-xs text-gray-500">Tap to chat</p></div>
              </div>
            )
          })}

          {tab === 'add' && (
            <div className="p-4 flex gap-2">
              <input className="flex-1 border rounded px-3 text-sm" placeholder="Cari NIM..." value={search} onChange={e => setSearch(e.target.value)} />
              <button onClick={sendReq} className="bg-green-600 text-white p-2 rounded"><Send size={18}/></button>
            </div>
          )}

          {tab === 'requests' && reqs.map(r => (
            <div key={r.id} className="p-3 border-b flex justify-between items-center">
              <div><p className="font-bold text-sm">{r.fromName}</p><p className="text-xs">{r.fromNim}</p></div>
              <div className="flex gap-2">
                <button onClick={() => reply(r.id, 'rejected')} className="text-red-500"><X/></button>
                <button onClick={() => reply(r.id, 'accepted')} className="text-green-500"><Check/></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT ROOM */}
      <div className={`flex-1 flex flex-col bg-[#e5ded8] ${!chatId ? 'hidden md:flex' : 'flex'}`}>
        {!chatId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <p>Pilih teman untuk memulai percakapan</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-100 p-2 border-b flex items-center gap-3 shadow-sm">
              <button onClick={() => setChatId(null)} className="md:hidden"><ArrowLeft/></button>
              <Avatar seed={chatName} />
              <div className="flex-1"><h3 className="font-bold text-sm">{chatName}</h3><p className="text-xs">{chatId}</p></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {msgs.map(m => (
                <div key={m.id} className={`flex ${m.senderNim === profile?.nim ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-1.5 rounded-lg text-sm shadow-sm ${m.senderNim === profile?.nim ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                    <p>{m.text}</p>
                    <span className="text-[10px] text-gray-500 block text-right">{m.timestamp?.seconds ? new Date(m.timestamp.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...'}</span>
                  </div>
                </div>
              ))}
              <div ref={dummyRef}/>
            </div>
            <div className="p-2 bg-gray-100 flex gap-2">
              <input className="flex-1 px-4 py-2 rounded-full border-none text-sm" value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Tulis pesan..." />
              <button onClick={send} className="bg-green-600 text-white p-2 rounded-full"><Send size={18}/></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}