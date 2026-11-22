// Draws the "بطلة جدول التسعة الذهبية" certificate onto a canvas (downloadable PNG).
import { ar } from './game/arabic.js';

export function drawCertificate(info) {
  const W = 1600, H = 1130;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.direction = 'rtl';
  // background
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fff4fb'); bg.addColorStop(0.5, '#fffdf3'); bg.addColorStop(1, '#f2ecff');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // borders
  g.strokeStyle = '#e8b730'; g.lineWidth = 26; g.strokeRect(30, 30, W - 60, H - 60);
  g.strokeStyle = '#ff8fc8'; g.lineWidth = 6; g.strokeRect(68, 68, W - 136, H - 136);
  // corner stars
  const star = (x, y, r, col) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = col; g.fill();
  };
  [[120, 120], [W - 120, 120], [120, H - 120], [W - 120, H - 120]].forEach(([x, y]) => star(x, y, 40, '#ffd34d'));
  for (let i = 0; i < 26; i++) star(140 + Math.random() * (W - 280), 100 + Math.random() * 40, 8 + Math.random() * 8, ['#ffd34d', '#ff9ad5', '#b48cff', '#7ce7ff'][i % 4]);

  const F = (w, s) => `${w} ${s}px "Baloo Bhaijaan 2", Tajawal, Tahoma, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // trophy medal
  g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(W / 2, 215, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(W / 2, 215, 52, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c98a00'; g.font = F(800, 64); g.fillText(ar(9), W / 2, 220);

  g.fillStyle = '#b8338a'; g.font = F(800, 92); g.fillText('بطلة جدول التسعة الذهبية', W / 2, 355);
  g.fillStyle = '#6b4a8a'; g.font = F(500, 40); g.fillText('تشهد مغامرات بطلة جدول التسعة بأنّ البطلة', W / 2, 445);
  g.fillStyle = '#3d1f5c'; g.font = F(800, 96); g.fillText(info.name || 'البطلة', W / 2, 540);
  g.strokeStyle = '#ffd34d'; g.lineWidth = 5; g.beginPath(); g.moveTo(W / 2 - 330, 600); g.lineTo(W / 2 + 330, 600); g.stroke();
  g.fillStyle = '#6b4a8a'; g.font = F(500, 38); g.fillText('أنهت مغامرات جدول ضرب ٩ بنجاح وتميّز', W / 2, 650);

  // stat boxes
  const stats = [['مجموع النقاط', ar(info.score)], ['عدد النجوم', ar(info.stars)], ['نسبة الإتقان', `${ar(info.mastery)}٪`], ['المستوى', info.level]];
  const bw = 300, gap = 30, x0 = W / 2 + (stats.length * bw + (stats.length - 1) * gap) / 2;
  stats.forEach(([k, v], i) => {
    const x = x0 - i * (bw + gap) - bw;
    g.fillStyle = ['#ffe3f1', '#fff3c4', '#e3fff0', '#ece3ff'][i];
    rr(g, x, 700, bw, 130, 28); g.fill();
    g.fillStyle = '#6b4a8a'; g.font = F(500, 32); g.fillText(k, x + bw / 2, 740);
    g.fillStyle = '#3d1f5c'; g.font = F(800, 52); g.fillText(v, x + bw / 2, 795);
  });
  const facts = (arr) => (arr.length ? arr.map((n) => `${ar(9)}×${ar(n)}`).join('   ') : '—');
  g.textAlign = 'right';
  g.fillStyle = '#1f8a55'; g.font = F(700, 34); g.fillText(`✔ أتقنتِ: ${facts(info.mastered)}`, W - 150, 885);
  g.fillStyle = '#c4531f'; g.font = F(700, 34); g.fillText(`✎ تحتاج إلى تدريب: ${info.practice.length ? facts(info.practice) : 'لا شيء! أتقنتِ الجدول كله 🌟'}`, W - 150, 945);
  g.textAlign = 'center';
  g.fillStyle = '#8a6aa8'; g.font = F(500, 30); g.fillText(`مبارك يا بطلتنا! لقد أنهيتِ مغامرات جدول التسعة بنجاح — ${info.date}`, W / 2, 1025);
  return c;
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
