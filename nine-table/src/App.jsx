import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Engine } from './game/engine.js';
import { Audio } from './game/audio.js';
import { HEROINES } from './game/models.js';
import { DIFFS, FACTS, Learner, emptyStats } from './game/learning.js';
import { ar, words, formatTime } from './game/arabic.js';
import { drawCertificate } from './certificate.js';

const KEY = 'nine-hero-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const store = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const STAGES = [
  { title: 'طريق النجوم الوردية', emoji: '⭐', desc: 'وجّهي الدراجة نحو المسار الذي يحمل الإجابة الصحيحة.' },
  { title: 'محطات أميرات الضرب', emoji: '👑', desc: 'خمس بوابات سحرية، أجيبي لتفتحيها وتجمعي الجواهر.' },
  { title: 'منعطفات البطلات', emoji: '🏁', desc: 'منعطفات وجسور ونجوم، ثم تحدي العبقريات في القصر الذهبي.' },
];

function newSession(name, diff) {
  return { name, diff, unlocked: 1, score: 0, stars: 0, gems: 0, correct: 0, attempts: 0, questions: 0, firstTry: 0, time: 0, learner: { stats: emptyStats(), retry: [], q: 0 }, completed: false, startedAt: Date.now() };
}

export default function App() {
  const saved = useMemo(load, []);
  const hostRef = useRef(null);
  const engineRef = useRef(null);
  const audio = useMemo(() => new Audio(), []);
  const [screen, setScreen] = useState('home');
  const [heroIdx, setHeroIdx] = useState(saved.heroine ?? 0);
  const [muted, setMuted] = useState(!!saved.muted);
  const [music, setMusic] = useState(saved.music ?? true);
  const [quality, setQuality] = useState(saved.quality || (matchMedia('(pointer:coarse)').matches ? 'medium' : 'high'));
  const [session, setSession] = useState(saved.session || null);
  const [g, setG] = useState({});
  const [toast, setToast] = useState(null);
  const [webglError, setWebglError] = useState(false);
  const [after, setAfter] = useState('map');
  const gRef = useRef(g); gRef.current = g;

  // persist prefs
  useEffect(() => { store({ heroine: heroIdx, muted, music, quality, session }); }, [heroIdx, muted, music, quality, session]);
  useEffect(() => { audio.setMuted(muted); }, [muted, audio]);
  useEffect(() => { audio.setMusic(music); }, [music, audio]);

  // engine
  useEffect(() => {
    let eng;
    try {
      eng = new Engine(hostRef.current, {
        audio, quality,
        onState: (p) => {
          if (p.toast) { setToast({ text: p.toast, id: Math.random() }); delete p.toast; }
          setG((s) => ({ ...s, ...p, hud: p.hud ? { ...(s.hud || {}), ...p.hud } : s.hud }));
        },
        onSave: (s) => setSession({ ...s }),
      });
    } catch (e) { console.error(e); setWebglError(true); return undefined; }
    engineRef.current = eng;
    window.__nine = eng;
    eng.setHeroine(heroIdx);
    return () => eng.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { engineRef.current?.setQuality(quality); }, [quality]);

  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id); }, [toast]);

  const tap = useCallback(() => { audio.unlock(); audio.sfx('tap'); }, [audio]);
  const go = (s) => { tap(); setScreen(s); };

  const startStage = (st) => {
    tap();
    const eng = engineRef.current; if (!eng) return;
    setG({});
    setScreen('play');
    eng.startStage(st, session);
  };
  const backHome = () => { engineRef.current?.quit(); setG({}); setScreen('home'); };

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      const eng = engineRef.current; if (!eng || screen !== 'play') return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { eng.steer(-1); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { eng.steer(1); e.preventDefault(); }
      else if (k === 'p' || k === 'P' || k === 'Escape') eng.setPaused(!eng.paused);
      else if (k === 'r' || k === 'R') eng.replay();
      else if (gRef.current.panel && ['1', '2', '3'].includes(k)) eng.answerPanel(Number(k) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  // swipe steering
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0]; const dx = t.clientX - touch.current.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(t.clientY - touch.current.y)) engineRef.current?.steer(dx > 0 ? 1 : -1);
    touch.current = null;
  };

  const chooseHero = (i) => { tap(); setHeroIdx(i); engineRef.current?.setHeroine(i); audio.speak(`أنا ${HEROINES[i].name}، ${HEROINES[i].title}`); };

  return (
    <div className="app">
      <div className="stage3d" ref={hostRef} onTouchStart={screen === 'play' ? onTouchStart : undefined} onTouchEnd={screen === 'play' ? onTouchEnd : undefined} />
      {webglError && <div className="overlay"><div className="card"><h2>عذرًا 😢</h2><p>هذا الجهاز أو المتصفح لا يدعم الرسوم ثلاثية الأبعاد (WebGL). جرّبي متصفح Chrome أو Safari الحديث.</p></div></div>}

      {screen !== 'play' && (
        <div className="topctl">
          <IconBtn label={muted ? 'تشغيل الصوت' : 'إيقاف الصوت'} onClick={() => { audio.unlock(); setMuted(!muted); }}>{muted ? '🔇' : '🔊'}</IconBtn>
          <IconBtn label={music ? 'إيقاف الموسيقى' : 'تشغيل الموسيقى'} onClick={() => { audio.unlock(); setMusic(!music); }} off={!music}>🎵</IconBtn>
        </div>
      )}

      {screen === 'home' && (
        <Home
          session={session}
          onStart={() => { tap(); setAfter('map'); setScreen(session && !session.completed ? 'map' : 'setup'); }}
          onNew={() => go('setup')}
          onHeroes={() => go('heroes')} onLearn={() => { setAfter('home'); go('learn'); }} onHow={() => go('how')}
          quality={quality} setQuality={(q) => { tap(); setQuality(q); }}
          hero={HEROINES[heroIdx]}
        />
      )}
      {screen === 'heroes' && <Heroes heroIdx={heroIdx} choose={chooseHero} done={() => go('home')} />}
      {screen === 'how' && <HowTo audio={audio} done={() => go('home')} />}
      {screen === 'setup' && (
        <Setup initialName={session?.name || ''} initialDiff={session?.diff || 'beginner'} hero={HEROINES[heroIdx]}
          onBack={() => go('home')} onHeroes={() => go('heroes')}
          onDone={(name, diff) => { tap(); setSession(newSession(name, diff)); setAfter('map'); setScreen('learn'); audio.speak(`أهلًا يا ${name}! قبل أن نبدأ، لنتعلّم جدول التسعة معًا`); }} />
      )}
      {screen === 'learn' && <Learn audio={audio} onDone={() => go(after === 'map' && session ? 'map' : 'home')} cta={after === 'map' && session ? 'أنا مستعدة! إلى المغامرة 🚴🏻‍♀️' : 'رجوع'} />}
      {screen === 'map' && session && (
        <MapScreen session={session} start={startStage} back={() => go('home')} learn={() => { setAfter('map'); go('learn'); }} />
      )}
      {screen === 'play' && (
        <Play g={g} eng={engineRef.current} session={session} muted={muted} setMuted={(m) => { audio.unlock(); setMuted(m); }}
          music={music} setMusic={setMusic}
          toast={toast} onHome={backHome} onMap={() => { engineRef.current?.quit(); setG({}); setScreen('map'); }}
          onNext={(st) => startStage(st)} onCert={() => { tap(); setScreen('cert'); }} />
      )}
      {screen === 'cert' && session && (
        <Certificate session={session} audio={audio}
          onAgain={() => { engineRef.current?.quit(); setG({}); setSession(newSession(session.name, session.diff)); setScreen('map'); }}
          onHome={() => { backHome(); }} />
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, off, big }) {
  return <button className={`iconbtn${off ? ' off' : ''}${big ? ' big' : ''}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

// ---------------- screens ----------------
function Home({ session, onStart, onNew, onHeroes, onLearn, onHow, quality, setQuality, hero }) {
  const inProgress = session && !session.completed;
  return (
    <div className="screen home">
      <div className="hero-title">
        <div className="badge">🚴🏻‍♀️ ✨</div>
        <h1>مغامرات بطلة <br /><span>جدول التسعة</span></h1>
        <p className="slogan">انطلقي، احسبي، اجمعي النجوم، وكوني بطلة الضرب!</p>
        <p className="ask">هل أنتِ مستعدة لتصبحي بطلة الضرب؟</p>
      </div>
      <div className="menu">
        <button className="btn primary xl" onClick={onStart}>{inProgress ? `متابعة المغامرة يا ${session.name} 🚀` : 'ابدئي المغامرة 🚀'}</button>
        {inProgress && <button className="btn ghost" onClick={onNew}>مغامرة جديدة</button>}
        <div className="row">
          <button className="btn pink" onClick={onHeroes}>اختاري بطلتك 👧🏻</button>
          <button className="btn sky" onClick={onLearn}>تعلّمي جدول ٩ 📖</button>
          <button className="btn lilac" onClick={onHow}>طريقة اللعب ❓</button>
        </div>
        <div className="quality">
          <span>جودة الرسوم:</span>
          {[['low', 'خفيفة'], ['medium', 'متوسطة'], ['high', 'عالية']].map(([k, l]) => (
            <button key={k} className={`chip${quality === k ? ' on' : ''}`} onClick={() => setQuality(k)}>{l}</button>
          ))}
        </div>
        <p className="tiny">البطلة الآن: <b style={{ color: hero.css }}>{hero.name}</b> — {hero.title}</p>
      </div>
    </div>
  );
}

function Heroes({ heroIdx, choose, done }) {
  return (
    <div className="screen side">
      <div className="panel narrow">
        <h2>اختاري بطلتك</h2>
        <p className="muted">اضغطي على البطلة لتظهر بجانب دراجتها.</p>
        <div className="heroes">
          {HEROINES.map((h, i) => (
            <button key={h.name} className={`herocard${i === heroIdx ? ' on' : ''}`} style={{ '--c': h.css }} onClick={() => choose(i)}>
              <span className="face" aria-hidden>{['👧🏻', '👧🏽', '👱🏻‍♀️'][i]}</span>
              <b>{h.name}</b><small>{h.title}</small>
              {i === heroIdx && <span className="tick">✔</span>}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={done}>تم الاختيار ✨</button>
      </div>
    </div>
  );
}

function HowTo({ done, audio }) {
  return (
    <div className="screen side">
      <div className="panel narrow scroll">
        <h2>طريقة اللعب</h2>
        <ul className="how">
          <li><b>⭐ المرحلة الأولى:</b> يظهر سؤال من جدول ٩، وأمامكِ ثلاثة مسارات. وجّهي الدراجة نحو الإجابة الصحيحة.</li>
          <li><b>👑 المرحلة الثانية:</b> تتوقف الدراجة عند خمس بوابات سحرية، اضغطي على الإجابة الصحيحة لتفتحيها.</li>
          <li><b>🏁 المرحلة الثالثة:</b> اجمعي النجوم، وتجنّبي الكعكات 🧁، واختاري البوابة الصحيحة، ثم حُلّي سؤال الأذكياء في القصر الذهبي.</li>
          <li><b>🎮 التحكم:</b> الأسهم ← → أو A / D على الحاسوب، وعلى الجوال: الأزرار الكبيرة أو السحب يمينًا ويسارًا، أو المس الإجابة نفسها.</li>
          <li><b>🔈 الصوت:</b> اضغطي زر السماعة لتسمعي السؤال والإجابات مرة أخرى.</li>
          <li><b>💗 لا تقلقي:</b> لا تُخصم نقاط عند الخطأ، وسنعيد عليكِ العمليات الصعبة حتى تتقنيها.</li>
        </ul>
        {!audio.hasArabicVoice && <p className="note">ملاحظة: لم نجد صوتًا عربيًا في هذا المتصفح، قد يُقرأ السؤال بصوت مختلف. يمكن إضافة اللغة العربية من إعدادات الجهاز.</p>}
        <button className="btn primary" onClick={done}>فهمت! 👍</button>
      </div>
    </div>
  );
}

function Setup({ initialName, initialDiff, onDone, onBack, hero, onHeroes }) {
  const [name, setName] = useState(initialName);
  const [diff, setDiff] = useState(initialDiff);
  const ok = name.trim().length > 0;
  return (
    <div className="screen side">
      <form className="panel narrow" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(name.trim().slice(0, 24), diff); }}>
        <h2>من هي بطلتنا اليوم؟</h2>
        <label className="field">
          <span>اكتبي اسمكِ (سيظهر في الشهادة)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: سارة" maxLength={24} autoFocus />
        </label>
        <span className="field-label">اختاري درجة الصعوبة</span>
        <div className="diffs">
          {Object.values(DIFFS).map((d) => (
            <button type="button" key={d.id} className={`diff${diff === d.id ? ' on' : ''}`} onClick={() => setDiff(d.id)}>
              <span>{d.emoji}</span><b>{d.label}</b>
              <small>{d.id === 'beginner' ? 'سرعة هادئة ووقت أطول' : d.id === 'advanced' ? 'أسئلة متنوعة وسرعة أكبر' : 'تحدٍّ سريع للبطلات'}</small>
            </button>
          ))}
        </div>
        <p className="tiny">بطلتكِ: <b style={{ color: hero.css }}>{hero.name}</b> · <button type="button" className="link" onClick={onHeroes}>تغيير</button></p>
        <div className="row">
          <button type="button" className="btn ghost" onClick={onBack}>رجوع</button>
          <button type="submit" className="btn primary" disabled={!ok}>التالي ←</button>
        </div>
      </form>
    </div>
  );
}

function Learn({ audio, onDone, cta }) {
  const [active, setActive] = useState(null);
  const playing = useRef(false);
  const sayFact = (n) => { audio.unlock(); setActive(n); return audio.speak(`تسعة في ${words(n)} يساوي ${words(9 * n)}`); };
  const playAll = async () => {
    if (playing.current) { playing.current = false; audio.stopSpeech(); setActive(null); return; }
    audio.unlock(); playing.current = true;
    for (const n of FACTS) { if (!playing.current) break; await sayFact(n); await new Promise((r) => setTimeout(r, 250)); }
    playing.current = false; setActive(null);
  };
  useEffect(() => () => { playing.current = false; }, []);
  return (
    <div className="screen side">
      <div className="panel wide scroll">
        <h2>جدول ضرب ٩ 📖</h2>
        <p className="muted">اضغطي على أي عملية لتسمعيها.</p>
        <div className="table9">
          {FACTS.map((n) => (
            <button key={n} className={`fact${active === n ? ' on' : ''}`} onClick={() => sayFact(n)}>
              <span className="eq">{ar(9)} × {ar(n)} = <b>{ar(9 * n)}</b></span>
              <span className="dots" aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>
            </button>
          ))}
        </div>
        <div className="trick">
          <b>✨ سرّ التسعة:</b> كلما زدنا واحدًا، تزيد العشرات واحدًا وتنقص الآحاد واحدًا (٩، ١٨، ٢٧، ٣٦…)، ومجموع رقمي الناتج دائمًا ٩ — مثل ٢٧: ٢ + ٧ = ٩.
        </div>
        <div className="row">
          <button className="btn sky" onClick={playAll}>🔊 اسمعي الجدول كله</button>
          <button className="btn primary" onClick={() => { playing.current = false; audio.stopSpeech(); onDone(); }}>{cta}</button>
        </div>
      </div>
    </div>
  );
}

function MapScreen({ session, start, back, learn }) {
  const un = session.unlocked || 1;
  return (
    <div className="screen side">
      <div className="panel narrow scroll">
        <h2>خريطة المغامرة يا {session.name}</h2>
        <p className="muted">المستوى: {DIFFS[session.diff]?.label} · ⭐ {ar(session.stars)} · 🏅 {ar(session.score)}</p>
        <div className="stages">
          {STAGES.map((s, i) => {
            const locked = i + 1 > un, done = i + 2 <= un;
            return (
              <button key={s.title} className={`stagecard${locked ? ' locked' : ''}${done ? ' done' : ''}`} disabled={locked} onClick={() => start(i)}>
                <span className="num">{locked ? '🔒' : s.emoji}</span>
                <span className="txt"><b>المرحلة {ar(i + 1)}: {s.title}</b><small>{locked ? 'أكملي المرحلة السابقة لفتحها' : s.desc}</small></span>
                {done && <span className="ok">✔</span>}
              </button>
            );
          })}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={back}>القائمة</button>
          <button className="btn sky" onClick={learn}>مراجعة جدول ٩</button>
        </div>
      </div>
    </div>
  );
}

function Groups({ n, icon = '●', highlightFrom = null }) {
  return (
    <div className="groups" aria-label={`${n} مجموعات في كل مجموعة ٩`}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`grp${highlightFrom != null && i >= highlightFrom ? ' new' : ''}`}>
          <span className="gi">{Array.from({ length: 9 }, (_, k) => <i key={k}>{icon}</i>)}</span>
          <small>{ar(9)}</small>
        </div>
      ))}
    </div>
  );
}

function Play({ g, eng, session, muted, setMuted, music, setMusic, toast, onHome, onMap, onNext, onCert }) {
  const hud = g.hud || {};
  const q = g.question, fb = g.feedback, panel = g.panel;
  const portrait = typeof window !== 'undefined' && matchMedia('(pointer:coarse)').matches && window.innerHeight > window.innerWidth;
  const [hideRot, setHideRot] = useState(false);
  const stage = g.stage ?? 0;
  if (!eng) return null;
  const steerBtns = !panel && !g.stageDone && !g.finished && !g.finale;
  return (
    <div className="play">
      <div className="hud">
        <div className="stats">
          <Stat icon="🏅" label="النقاط" v={ar(hud.score ?? 0)} />
          <Stat icon="⭐" label="النجوم" v={ar(hud.stars ?? 0)} />
          <Stat icon="💎" label="الجواهر" v={ar(hud.gems ?? 0)} />
          <Stat icon="✅" label="صحيحة" v={ar(hud.correct ?? 0)} />
          <Stat icon="🎯" label="المحاولات" v={ar(hud.attempts ?? 0)} />
          <Stat icon="⏱️" label="الوقت" v={formatTime(hud.time ?? 0)} />
        </div>
        <div className="ctl">
          <IconBtn label="أعيدي سماع السؤال" onClick={() => { eng.audio.unlock(); eng.replay(); }}>🔈</IconBtn>
          <IconBtn label={muted ? 'تشغيل الصوت' : 'إيقاف الصوت'} onClick={() => setMuted(!muted)}>{muted ? '🔇' : '🔊'}</IconBtn>
          <IconBtn label="إيقاف مؤقت" onClick={() => eng.setPaused(true)}>⏸️</IconBtn>
        </div>
      </div>
      <div className="progress" title="التقدم في المرحلة">
        <span className="plabel">{STAGES[stage].emoji} {STAGES[stage].title}</span>
        <div className="bar"><div style={{ width: `${Math.round((g.progress || 0) * 100)}%` }} /></div>
        <span className="pcount">{ar(g.stageCorrect || 0)} / {ar(g.required || 0)}</span>
      </div>

      {q && !panel && (
        <div className="qcard" key={q.id}>
          <div className="qtext">{q.text}</div>
          <div className="lanes">
            {q.options.map((o, i) => (
              <button key={i} className={`lane${g.lane === i ? ' on' : ''}`} onClick={() => eng.setLane(i)}>{o}</button>
            ))}
          </div>
        </div>
      )}

      {fb && !panel && (
        <div className={`feedback ${fb.ok ? 'ok' : 'no'}`} key={fb.id}>
          <b>{fb.title}</b>
          <span className="fline">{fb.line}</span>
          {!fb.ok && fb.groups && <><Groups n={fb.groups} /><small>{ar(fb.groups)} مجموعات، في كل مجموعة {ar(9)}</small></>}
        </div>
      )}

      {toast && <div className="toast" key={toast.id}>{toast.text}</div>}

      {panel && <Panel p={panel} eng={eng} />}

      {steerBtns && (
        <>
          <button className="steer left" aria-label="يسار" onPointerDown={(e) => { e.preventDefault(); eng.audio.unlock(); eng.steer(-1); }}>◀</button>
          <button className="steer right" aria-label="يمين" onPointerDown={(e) => { e.preventDefault(); eng.audio.unlock(); eng.steer(1); }}>▶</button>
        </>
      )}

      {portrait && !hideRot && !panel && <button className="rotate" onClick={() => setHideRot(true)}>📱↻ لتجربة أجمل أديري الجهاز أفقيًا ✕</button>}

      {g.paused && (
        <div className="overlay">
          <div className="card">
            <h2>استراحة قصيرة ☕</h2>
            <div className="col">
              <button className="btn primary" onClick={() => eng.setPaused(false)}>متابعة اللعب ▶</button>
              <button className="btn sky" onClick={() => setMusic(!music)}>{music ? 'إيقاف الموسيقى 🎵' : 'تشغيل الموسيقى 🎵'}</button>
              <button className="btn lilac" onClick={() => { const el = document.documentElement; (el.requestFullscreen?.() || Promise.resolve()).then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); }}>ملء الشاشة ⛶</button>
              <button className="btn ghost" onClick={onMap}>خريطة المغامرة</button>
              <button className="btn ghost" onClick={onHome}>القائمة الرئيسية</button>
            </div>
          </div>
        </div>
      )}

      {g.stageDone && (
        <div className="overlay">
          <div className="card celebrate">
            <div className="big">🎉</div>
            <h2>أحسنتِ يا بطلة! أكملتِ المرحلة {ar(g.stageDone.stage + 1)}</h2>
            <p>⭐ {ar(hud.stars ?? 0)} نجمة · 🏅 {ar(hud.score ?? 0)} نقطة · 💎 {ar(hud.gems ?? 0)}</p>
            <p className="muted">{g.stageDone.stage === 0 ? 'التالي: محطات أميرات الضرب 👑' : 'التالي: منعطفات البطلات والقصر الذهبي 🏁'}</p>
            <div className="col">
              <button className="btn primary xl" onClick={() => onNext(g.stageDone.stage + 1)}>المرحلة التالية 🚀</button>
              <button className="btn ghost" onClick={onMap}>خريطة المغامرة</button>
            </div>
          </div>
        </div>
      )}

      {g.finished && (
        <div className="overlay soft">
          <div className="card celebrate">
            <div className="big">🏆</div>
            <h2>مبارك يا بطلتنا {session?.name}!</h2>
            <p>لقد أنهيتِ مغامرات جدول التسعة بنجاح!</p>
            <button className="btn primary xl" onClick={onCert}>استلمي شهادتكِ الذهبية 📜</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, v }) {
  return <div className="stat" title={label}><span className="si">{icon}</span><span className="sv">{v}</span><span className="sl">{label}</span></div>;
}

function Panel({ p, eng }) {
  const castle = p.kind === 'castle';
  return (
    <div className="overlay panelwrap">
      <div className={`card qpanel${castle ? ' castle' : ''}`}>
        <div className="ptitle">{castle ? '🏰 تحدي العبقريات – سؤال الأذكياء' : `👑 المحطة ${ar(p.station)} من ${ar(5)}`}</div>
        <div className="pq">
          <span className={castle ? 'wordq' : 'bigq'}>{p.text}</span>
          <IconBtn big label="اسمعي السؤال" onClick={() => { eng.audio.unlock(); eng.replay(); }}>🔈</IconBtn>
        </div>
        {castle && <Groups n={p.groups} icon={p.icon} highlightFrom={p.newGroups ? p.groups - p.newGroups : null} />}
        <div className="opts">
          {p.options.map((o, i) => (
            <button key={i} className={`opt o${i}${p.disabled.includes(i) ? ' wrong' : ''}${p.solved && p.correctIndex === i ? ' right' : ''}`}
              disabled={p.disabled.includes(i) || p.solved || !!p.reveal} onClick={() => { eng.audio.unlock(); eng.answerPanel(i); }}>
              {o}
            </button>
          ))}
        </div>
        {p.hint && !p.reveal && !p.solved && (
          <div className="hint">
            <b>💡 فرصة ثانية! فكّري معي:</b>
            {!castle && <Groups n={p.n} />}
            <span>{ar(p.n)} مجموعات، في كل مجموعة {ar(9)}. عدّي تسعة تسعة!</span>
          </div>
        )}
        {p.reveal && (
          <div className="reveal">
            <b>لا بأس يا بطلة، هكذا نحسبها:</b>
            {!castle && <Groups n={p.n} />}
            <span className="fline">{p.reveal.line}</span>
            <button className="btn primary" onClick={() => eng.nextPanelQuestion()}>سؤال جديد ←</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Certificate({ session, onAgain, onHome, audio }) {
  const learner = useMemo(() => new Learner(session.learner), [session]);
  const mastered = learner.mastered(), practice = learner.needsPractice();
  const mastery = session.questions ? Math.round((100 * session.firstTry) / session.questions) : 0;
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  useEffect(() => {
    let live = true;
    const make = () => {
      const c = drawCertificate({
        name: session.name, score: session.score, stars: session.stars, mastery, level: DIFFS[session.diff]?.label || '',
        mastered, practice, date: new Date().toLocaleDateString('ar-SA-u-nu-arab', { year: 'numeric', month: 'long', day: 'numeric' }),
      });
      c.toBlob((b) => { if (!live || !b) return; setBlob(b); setUrl(URL.createObjectURL(b)); }, 'image/png');
    };
    (document.fonts?.ready || Promise.resolve()).then(make);
    audio.speak(`مبارك يا ${session.name}! هذه شهادتكِ: بطلة جدول التسعة الذهبية`);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fileName = 'certificate-batalat-jadwal-9.png';
  const share = async () => {
    const file = blob && new File([blob], fileName, { type: 'image/png' });
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'بطلة جدول التسعة الذهبية', text: `${session.name} أصبحت بطلة جدول التسعة الذهبية! 🏆` });
      else if (navigator.share) await navigator.share({ title: 'مغامرات بطلة جدول التسعة', text: `${session.name} أصبحت بطلة جدول التسعة الذهبية! 🏆`, url: location.href });
      else download();
    } catch { /* cancelled */ }
  };
  const download = () => { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); };
  return (
    <div className="screen side">
      <div className="panel wide scroll cert">
        <h2>🏆 شهادة بطلة جدول التسعة الذهبية</h2>
        {url ? <img src={url} alt={`شهادة ${session.name}`} className="certimg" /> : <div className="certimg loading">جارٍ تجهيز الشهادة…</div>}
        <div className="certinfo">
          <span>🏅 {ar(session.score)} نقطة</span><span>⭐ {ar(session.stars)} نجمة</span><span>🎯 الإتقان {ar(mastery)}٪</span><span>⏱️ {formatTime(session.time)}</span>
        </div>
        <p className="okline">✔ أتقنتِ: {mastered.length ? mastered.map((n) => `${ar(9)}×${ar(n)}`).join('، ') : '—'}</p>
        <p className="practice">✎ تحتاج إلى تدريب: {practice.length ? practice.map((n) => `${ar(9)}×${ar(n)}`).join('، ') : 'لا شيء! أتقنتِ الجدول كله 🌟'}</p>
        <div className="row">
          <button className="btn primary" onClick={download} disabled={!url}>تنزيل الشهادة 📥</button>
          <button className="btn pink" onClick={share} disabled={!url}>مشاركة مع الأسرة والمعلمة 💌</button>
        </div>
        <div className="row">
          <button className="btn sky" onClick={onAgain}>العبي مرة أخرى 🔁</button>
          <button className="btn ghost" onClick={onHome}>القائمة الرئيسية</button>
        </div>
      </div>
    </div>
  );
}
