// Trecho do gerador de leads do Nostro Hub (functions/api/leads/[acao].js), usado pelas ferramentas do Josué.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function falha(status, publico, detalhe) { const e = new Error(detalhe || publico); e.status = status; e.publico = publico; return e; }
const limpa = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
async function comPrazo(url, opts = {}, ms = 9000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

const UA_OSM = 'NostroHub/1.0 (+https://nostrohub.com.br)';
const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const LIMITES = { 1: 50, 2: 100, 3: 200 };

// Nichos comuns em português -> etiquetas do OpenStreetMap
const NICHOS_OSM = [
  [/dent|odont/, ['amenity=dentist', 'healthcare=dentist']],
  [/academia|fitness|crossfit|musculac|pilates/, ['leisure=fitness_centre', 'leisure=sports_centre']],
  [/pizz/, ['cuisine~pizza']],
  [/restaurante|churrascaria/, ['amenity=restaurant']],
  [/lanchonete|hamburg|lanche/, ['amenity=fast_food']],
  [/cafeteria|\bcafe\b/, ['amenity=cafe']],
  [/\bbar\b|\bpub\b|choperia/, ['amenity=bar', 'amenity=pub']],
  [/padaria|panific/, ['shop=bakery']],
  [/supermercado|mercado|mercearia/, ['shop=supermarket', 'shop=convenience']],
  [/farmacia|drogaria/, ['amenity=pharmacy']],
  [/barbearia|cabeleir|salao/, ['shop=hairdresser']],
  [/estetica|beleza|manicure|unha|sobrancelha|depila/, ['shop=beauty']],
  [/roupa|moda|boutique|vestuario/, ['shop=clothes', 'shop=boutique']],
  [/calcad|sapat/, ['shop=shoes']],
  [/otica/, ['shop=optician']],
  [/pet ?shop|\bpet\b/, ['shop=pet']],
  [/veterin/, ['amenity=veterinary']],
  [/imobiliar|corretor de imo/, ['office=estate_agent']],
  [/contab|contador/, ['office=accountant']],
  [/advoca|advogad/, ['office=lawyer']],
  [/fisioter/, ['healthcare=physiotherapist']],
  [/psicolog|terapia/, ['healthcare=psychotherapist']],
  [/clinica|consultorio|medic/, ['amenity=clinic', 'healthcare=clinic', 'amenity=doctors']],
  [/hotel|pousada|hostel/, ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel']],
  [/escola|colegio/, ['amenity=school']],
  [/idioma|ingles|curso/, ['amenity=language_school', 'amenity=training']],
  [/oficina|mecanic|auto ?center/, ['shop=car_repair']],
  [/auto ?peca/, ['shop=car_parts']],
  [/material de constr|construcao|ferragem/, ['shop=hardware', 'shop=doityourself']],
  [/construtora|engenharia/, ['office=construction_company', 'office=engineer']],
  [/movei|moveis|colchao/, ['shop=furniture']],
  [/joalher|relojoar/, ['shop=jewelry']],
  [/floric/, ['shop=florist']],
  [/grafica/, ['shop=copyshop', 'craft=printer']],
  [/seguranca eletronica|alarme|portaria/, ['shop=security', 'office=security']],
  [/agropecuar|agro|veterinaria rural/, ['shop=agrarian']],
  [/cosmetic|perfumar/, ['shop=cosmetics', 'shop=perfumery']],
  [/igreja/, ['amenity=place_of_worship']]
];
const PALAVRAS_GENERICAS = new Set(['clinica', 'loja', 'casa', 'centro', 'empresa', 'servico', 'servicos', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'the', 'and', 'of', 'shop', 'store']);
const CATEGORIA_OSM = { dentist: 'Dentista', fitness_centre: 'Academia', sports_centre: 'Centro esportivo', restaurant: 'Restaurante', fast_food: 'Lanchonete', cafe: 'Café', bar: 'Bar', pub: 'Bar', bakery: 'Padaria', supermarket: 'Supermercado', convenience: 'Conveniência', pharmacy: 'Farmácia', hairdresser: 'Salão / barbearia', beauty: 'Estética', clothes: 'Loja de roupas', boutique: 'Boutique', shoes: 'Calçados', optician: 'Ótica', pet: 'Pet shop', veterinary: 'Veterinário', estate_agent: 'Imobiliária', accountant: 'Contabilidade', lawyer: 'Advocacia', physiotherapist: 'Fisioterapia', psychotherapist: 'Psicologia', clinic: 'Clínica', doctors: 'Consultório médico', hotel: 'Hotel', guest_house: 'Pousada', hostel: 'Hostel', school: 'Escola', language_school: 'Escola de idiomas', training: 'Cursos', car_repair: 'Oficina', car_parts: 'Autopeças', hardware: 'Material de construção', doityourself: 'Material de construção', construction_company: 'Construtora', engineer: 'Engenharia', furniture: 'Móveis', jewelry: 'Joalheria', florist: 'Floricultura', copyshop: 'Gráfica', printer: 'Gráfica', security: 'Segurança', agrarian: 'Agropecuária', cosmetics: 'Cosméticos', perfumery: 'Perfumaria', place_of_worship: 'Igreja' };

const CATEGORIA_TT = { DENTIST: 'Dentista', DOCTOR: 'Consultório médico', HOSPITAL_POLYCLINIC: 'Hospital / clínica', HEALTH_CARE_SERVICE: 'Saúde', PHARMACY: 'Farmácia', RESTAURANT: 'Restaurante', CAFE_PUB: 'Café / bar', HOTEL_MOTEL: 'Hotel', SHOP: 'Loja', CLUB_ASSOCIATION: 'Clube', FITNESS_CLUB_CENTER: 'Academia', SPORTS_CENTER: 'Centro esportivo', BEAUTY_SALON: 'Salão de beleza', HAIRDRESSER: 'Cabeleireiro', REAL_ESTATE_AGENT: 'Imobiliária', LEGAL_SERVICES: 'Advocacia', SCHOOL: 'Escola', COLLEGE_UNIVERSITY: 'Faculdade', LANGUAGE_SCHOOL: 'Escola de idiomas', REPAIR_FACILITY: 'Oficina', CAR_DEALER: 'Concessionária', VETERINARIAN: 'Veterinário', BANK: 'Banco', COMPANY: 'Empresa', PLACE_OF_WORSHIP: 'Igreja', MARKET: 'Mercado', BAKERY: 'Padaria', GENERAL_PRACTITIONER: 'Clínico geral', OPTICIAN: 'Ótica', PET_SHOP: 'Pet shop', ACCOUNTANT: 'Contabilidade', FINANCIAL_INSTITUTION: 'Financeira', IMPORTANT_TOURIST_ATTRACTION: 'Atração turística' };

export function telefoneBR(bruto) {
  const d = String(bruto || '').replace(/\D/g, '');
  if (!d) return { nac: '', intl: '' };
  let n = d;
  if (/^55\d{10,11}$/.test(d)) n = d.slice(2);
  else if (/^0\d{10,11}$/.test(d)) n = d.slice(1);             // 0 + DDD (discagem antiga)
  if (n.length === 10 || n.length === 11) {
    const nac = n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return { nac, intl: '+55' + n };
  }
  return { nac: '', intl: d.length >= 10 ? '+' + d : '' };
}
function siteComProtocolo(u) {
  const s = String(u || '').trim().split(/[;\s]+/)[0];
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
}
function linkGoogleMaps(nome, endereco) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([nome, endereco].filter(Boolean).join(', '));
}
function handleInstagram(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/instagram\.com\/([A-Za-z0-9_.]{1,30})/i);
  const h = (m ? m[1] : s.replace(/^@/, '')).replace(/\/.*$/, '').toLowerCase();
  return /^[a-z0-9_.]{1,30}$/.test(h) && !IG_RESERVADO.has(h) ? h : '';
}

async function geocodificar(local, env) {
  if (env.TOMTOM_KEY) {
    try {
      const r = await comPrazo(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(local)}.json?key=${encodeURIComponent(env.TOMTOM_KEY)}&limit=1&language=pt-BR`, {}, 9000);
      if (r.ok) {
        const j = await r.json(), g = (j.results || [])[0];
        if (g && g.position) {
          const bb = g.boundingBox || g.viewport;
          return { lat: g.position.lat, lon: g.position.lon, bbox: bb && bb.topLeftPoint ? bb : null, raio: raioDoBbox(bb), pais: ((g.address || {}).countryCode || '').toUpperCase(), fonte: 'TomTom' };
        }
      } else if (r.status === 403 || r.status === 401) {
        throw falha(502, 'A TomTom recusou a chave ou o limite grátis do dia acabou. Confira a TOMTOM_KEY.', `geocode ${r.status}`);
      }
    } catch (e) { if (e.publico) throw e; }
  }
  const r = await comPrazo(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=pt-BR&q=${encodeURIComponent(local)}`, { headers: { 'User-Agent': UA_OSM, 'Accept-Language': 'pt-BR' } }, 9000);
  if (!r.ok) throw falha(502, 'Não consegui localizar a cidade agora. Tente de novo em instantes.', `nominatim ${r.status}`);
  const g = ((await r.json()) || [])[0];
  if (!g) throw falha(404, `Não encontrei o local "${local}". Escreva a cidade e o estado, por exemplo "Montes Claros, MG".`);
  const [s, n, w, e] = (g.boundingbox || []).map(Number);
  const bb = isFinite(s) ? { topLeftPoint: { lat: n, lon: w }, btmRightPoint: { lat: s, lon: e } } : null;
  return { lat: +g.lat, lon: +g.lon, bbox: bb, raio: raioDoBbox(bb), pais: ((g.address || {}).country_code || '').toUpperCase(), fonte: 'OpenStreetMap' };
}
function raioDoBbox(bb) {
  if (!bb || !bb.topLeftPoint || !bb.btmRightPoint) return 12000;
  const a = bb.topLeftPoint, b = bb.btmRightPoint;
  const dy = (a.lat - b.lat) * 111000, dx = (b.lon - a.lon) * 111000 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const r = Math.sqrt(dx * dx + dy * dy) / 2;
  return Math.round(Math.min(25000, Math.max(3000, r || 12000)));
}

async function buscarTomTom(termo, centro, limite, env) {
  const out = [];
  const base = `key=${encodeURIComponent(env.TOMTOM_KEY)}&language=pt-BR&lat=${centro.lat}&lon=${centro.lon}&radius=${centro.raio}`;
  // 1) busca por categoria (ex.: "dentista") e 2) busca livre em estabelecimentos (nome + categoria)
  const urls = [
    `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(termo)}.json?${base}&limit=100`,
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(termo)}.json?${base}&idxSet=POI&limit=100`
  ];
  if (limite > 100) urls.push(`https://api.tomtom.com/search/2/search/${encodeURIComponent(termo)}.json?${base}&idxSet=POI&limit=100&ofs=100`);
  let erro = '';
  for (const u of urls) {
    try {
      const r = await comPrazo(u, {}, 12000);
      if (r.status === 403 || r.status === 401) { erro = 'A TomTom recusou a chave ou o limite grátis do dia acabou.'; break; }
      if (!r.ok) continue;
      const j = await r.json();
      (j.results || []).forEach(x => { const n = normalizarTomTom(x); if (n) out.push(n); });
    } catch (e) { /* segue com a próxima */ }
  }
  return { lugares: out, erro };
}
export function normalizarTomTom(x) {
  const p = x && x.poi, a = (x && x.address) || {};
  if (!p || !p.name) return null;
  const cls = (p.classifications || [])[0];
  const nomeCat = cls && (cls.names || []).find(n => /^pt/i.test(n.nameLocale)) || (cls && (cls.names || [])[0]);
  let cat = (cls && CATEGORIA_TT[cls.code]) || (nomeCat && nomeCat.name) || (p.categories || [])[0] || '';
  cat = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : '';
  const tel = telefoneBR(p.phone);
  const pais = a.countryCode || '';
  return {
    id: 't:' + x.id,
    nome: p.name,
    categoria: cat,
    endereco: a.freeformAddress || '',
    cidade: a.municipality || a.municipalitySubdivision || '',
    uf: String(a.countrySubdivisionCode || a.countrySubdivision || '').replace(/^[A-Z]{2}-/, ''),
    pais,
    telefone: pais === 'BR' ? tel.nac : '',
    telefoneIntl: pais === 'BR' ? tel.intl : (String(p.phone || '').replace(/[^\d+]/g, '').replace(/^(?!\+)/, '+')),
    site: siteComProtocolo(p.url),
    nota: null,
    avaliacoes: null,
    maps: linkGoogleMaps(p.name, a.freeformAddress),
    lat: x.position && x.position.lat, lon: x.position && x.position.lon,
    fonte: 'TomTom'
  };
}

export function consultaOverpass(termo, centro) {
  const t = semAcento(termo);
  const filtros = [];
  for (const [re, tags] of NICHOS_OSM) if (re.test(t)) tags.forEach(tg => filtros.push(tg));
  const palavras = t.split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !PALAVRAS_GENERICAS.has(w)).map(w => w.replace(/[^a-z0-9]/g, ''));
  const area = `(around:${centro.raio},${centro.lat.toFixed(5)},${centro.lon.toFixed(5)})`;
  const partes = filtros.map(tg => {
    if (tg.includes('~')) { const [k, v] = tg.split('~'); return `nwr${area}["${k}"~"${v}",i]["name"];`; }
    const [k, v] = tg.split('='); return `nwr${area}["${k}"="${v}"]["name"];`;
  });
  if (palavras.length) partes.push(`nwr${area}["name"~"${palavras.slice(0, 4).join('|')}",i];`);
  if (!partes.length) return '';
  return `[out:json][timeout:10];(${partes.join('')});out center tags 300;`;
}
async function buscarOSM(termo, centro) {
  const q = consultaOverpass(termo, centro);
  if (!q) return [];
  for (const host of ['https://overpass-api.de/api/interpreter']) {
    try {
      const r = await comPrazo(host, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA_OSM }, body: 'data=' + encodeURIComponent(q) }, 9000);
      if (!r.ok) continue;
      const j = await r.json();
      return (j.elements || []).map(normalizarOSM).filter(Boolean);
    } catch (e) { /* tenta o outro servidor */ }
  }
  return [];
}
export function normalizarOSM(el) {
  const t = (el && el.tags) || {};
  if (!t.name) return null;
  const tipo = t.amenity || t.shop || t.office || t.healthcare || t.leisure || t.tourism || t.craft || '';
  const tel = telefoneBR(t.phone || t['contact:phone'] || t['contact:mobile'] || t['contact:whatsapp'] || '');
  const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
  const endereco = [rua, t['addr:suburb'], [t['addr:city'], t['addr:state']].filter(Boolean).join(' - ')].filter(Boolean).join(' - ');
  const lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
  return {
    id: 'o:' + el.type + '/' + el.id,
    nome: t.name,
    categoria: CATEGORIA_OSM[tipo] || (tipo ? tipo.replace(/_/g, ' ') : ''),
    endereco,
    cidade: t['addr:city'] || '',
    uf: t['addr:state'] || '',
    pais: (t['addr:country'] || '').toUpperCase(),
    telefone: tel.nac,
    telefoneIntl: tel.intl,
    site: siteComProtocolo(t.website || t['contact:website'] || t.url || ''),
    email: t.email || t['contact:email'] || '',
    instagram: handleInstagram(t['contact:instagram'] || t.instagram || ''),
    nota: null,
    avaliacoes: null,
    maps: linkGoogleMaps(t.name, endereco || t['addr:city'] || ''),
    lat, lon,
    fonte: 'OpenStreetMap'
  };
}
// Junta TomTom + OSM: mesma empresa (nome igual ou mesmo telefone) vira uma só, completando o que faltar.
export function juntarFontes(listas) {
  const out = [];
  const chaveNome = l => semAcento(l.nome).replace(/[^a-z0-9]/g, '');
  const fim = l => String(l.telefoneIntl || l.telefone || '').replace(/\D/g, '').slice(-8);
  for (const l of listas.flat()) {
    const kn = chaveNome(l), kt = fim(l);
    const ja = out.find(o => o.id === l.id || (kn && chaveNome(o) === kn) || (kt.length === 8 && fim(o) === kt));
    if (!ja) { out.push({ ...l }); continue; }
    for (const k of ['telefone', 'telefoneIntl', 'site', 'email', 'instagram', 'endereco', 'cidade', 'uf', 'pais', 'categoria']) if (!ja[k] && l[k]) ja[k] = l[k];
    if (ja.fonte !== l.fonte && !String(ja.fonte).includes(l.fonte)) ja.fonte = ja.fonte + ' + ' + l.fonte;
  }
  return out;
}

const IG_RESERVADO = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'direct', 'about', 'developer', 'legal', 'web', 'static', 'share', 'sharer', 'embed', 'oauth', 'privacy', 'terms', 'instagram', 'challenge', 'tags', 'locations', 'popular', 'emails', 'download', 'graphql', 'api']);
const FB_RESERVADO = new Set(['sharer', 'sharer.php', 'share', 'share.php', 'tr', 'plugins', 'dialog', 'login', 'login.php', 'events', 'groups', 'watch', 'help', 'policies', 'privacy', 'pages', 'hashtag', 'photo.php', 'photo', 'story.php', 'facebook', 'business', 'ads', 'l.php', 'v2.0', 'v3.0', 'home.php', 'people', 'gaming', 'marketplace']);
const EMAIL_RUIM = /\.(png|jpe?g|gif|webp|svg|css|js|ico|avif|bmp)$|@(sentry|wixpress|example|exemplo|domain|dominio|seudominio|email|seuemail|teste|test)\.|^(nome|seu|your|email|exemplo|example|usuario|user)@|u00|%40/i;

export function hostProibido(host) {
  const h = String(host || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (/^\[|:/.test(h)) return true;                                   // IPv6 literal
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return true;
  }
  return false;
}
export function normalizarUrl(u) {
  let s = String(u || '').trim();
  if (!s) return null;
  if ((/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(javascript|data|file|mailto|tel|ftp|blob):/i.test(s)) && !/^https?:\/\//i.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let url; try { url = new URL(s); } catch (e) { return null; }
  if (!/^https?:$/.test(url.protocol) || hostProibido(url.hostname)) return null;
  return url;
}
export function digitosCnpjValidos(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base, pesos) => { const s = pesos.reduce((a, p, i) => a + (+base[i]) * p, 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = calc(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === +d[12] && d2 === +d[13];
}
function decodificar(html) {
  return String(html)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/').replace(/\\u0040/g, '@');
}
const unicos = arr => [...new Set(arr.filter(Boolean))];

// Lê o HTML e tira o que interessa para a prospecção. Exportado para os testes.
export function extrairDoHtml(htmlBruto, baseUrl) {
  const html = decodificar(htmlBruto || '');
  const out = { instagram: [], facebook: [], whatsapp: [], emails: [], telefones: [], cnpjs: [], pixelMeta: false, googleTag: false, googleAds: false, responsivo: false, titulo: '', plataforma: '' };

  for (const m of html.matchAll(/instagram\.com\/([A-Za-z0-9_.]{1,30})(?![A-Za-z0-9_.])/gi)) {
    const h = m[1].replace(/\.+$/, '').toLowerCase();
    if (h && !IG_RESERVADO.has(h)) out.instagram.push(h);
  }
  for (const m of html.matchAll(/(?:facebook|fb)\.com\/(profile\.php\?id=\d+|[A-Za-z0-9.\-]{2,80})/gi)) {
    const h = m[1].replace(/\.+$/, '');
    if (!FB_RESERVADO.has(h.toLowerCase())) out.facebook.push(h);
  }
  for (const m of html.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:[^"'<>\s]*?&(?:amp;)?)?phone=|wa\.link\/)(\+?[\d][\d\s().-]{6,22}\d)?/gi)) {
    if (m[1]) { const d = m[1].replace(/\D/g, ''); if (d.length >= 10 && d.length <= 15) out.whatsapp.push(d); }
  }
  for (const m of html.matchAll(/href=["']tel:([^"']{6,30})["']/gi)) {
    const d = m[1].replace(/[^\d+]/g, ''); if (d.replace(/\D/g, '').length >= 8) out.telefones.push(d);
  }
  const semTags = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const fontesEmail = [...html.matchAll(/mailto:([^"'?<>\s]+)/gi)].map(m => m[1]).concat([...semTags.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g)].map(m => m[0]));
  for (let e of fontesEmail) {
    e = decodeURIComponentSeguro(e).toLowerCase().replace(/^[^a-z0-9]+/, '').replace(/[.,;:]+$/, '');
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(e) && !EMAIL_RUIM.test(e)) out.emails.push(e);
  }
  for (const m of semTags.matchAll(/(?<![\d])(\d{2}\.?\d{3}\.?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2})(?![\d])/g)) {
    const d = m[1].replace(/\D/g, '');
    if (digitosCnpjValidos(d)) out.cnpjs.push(d);
  }
  out.pixelMeta = /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/i.test(html);
  out.googleTag = /googletagmanager\.com\/(?:gtag\/js|gtm\.js)|google-analytics\.com\/(?:analytics|ga)\.js|gtag\(\s*['"]config['"]\s*,\s*['"]G-|['"]GTM-[A-Z0-9]{4,}['"]/i.test(html);
  out.googleAds = /gtag\(\s*['"]config['"]\s*,\s*['"]AW-|googleadservices\.com|['"]AW-\d{6,}/i.test(html);
  out.responsivo = /<meta[^>]+name=["']viewport["']/i.test(html);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); out.titulo = t ? t[1].replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  out.plataforma = /wixstatic\.com|_wixCssImports|wix-code/i.test(html) ? 'Wix'
    : /wp-content|wp-includes/i.test(html) ? 'WordPress'
    : /cdn\.shopify\.com/i.test(html) ? 'Shopify'
    : /nuvemshop|tiendanube/i.test(html) ? 'Nuvemshop'
    : /squarespace/i.test(html) ? 'Squarespace'
    : /webflow/i.test(html) ? 'Webflow'
    : /linktr\.ee|linktree/i.test(html) ? 'Linktree' : '';
  // link para a página de contato do mesmo site (para uma segunda leitura)
  out.paginaContato = '';
  if (baseUrl) {
    for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
      if (!/contato|contact|fale-?conosco|atendimento/i.test(m[1])) continue;
      try { const u = new URL(m[1], baseUrl); if (u.hostname === new URL(baseUrl).hostname && /^https?:$/.test(u.protocol)) { out.paginaContato = u.href; break; } } catch (e) { /* ignora */ }
    }
  }
  for (const k of ['instagram', 'facebook', 'whatsapp', 'emails', 'telefones', 'cnpjs']) out[k] = unicos(out[k]).slice(0, 6);
  return out;
}
function decodeURIComponentSeguro(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

async function baixarHtml(url, ms) {
  const r = await comPrazo(url.href, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6' }, redirect: 'follow' }, ms);
  const tipo = r.headers.get('content-type') || '';
  let texto = '';
  if (r.body && /html|text|xml/i.test(tipo || 'text/html')) {
    const leitor = r.body.getReader(); const dec = new TextDecoder(); let total = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.length; texto += dec.decode(value, { stream: true });
      if (total > 1500000) { try { leitor.cancel(); } catch (e) { /* ok */ } break; }
    }
  }
  return { status: r.status, final: r.url || url.href, texto };
}

export function tipoDoEndereco(url) {
  const h = url.hostname.replace(/^www\./, '').toLowerCase();
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)(facebook|fb)\.com$/.test(h)) return 'facebook';
  if (/(^|\.)(wa\.me|whatsapp\.com|wa\.link)$/.test(h)) return 'whatsapp';
  if (/(^|\.)(linktr\.ee|linkr\.bio|beacons\.ai|bio\.link|linkbio\.co|campsite\.bio)$/.test(h)) return 'agregador';
  if (/(^|\.)(google\.com|business\.site|g\.page|goo\.gl)$/.test(h)) return 'google';
  if (/(^|\.)(ifood\.com\.br|doctoralia\.com\.br|booksy\.com|tiktok\.com|youtube\.com|linkedin\.com|x\.com|twitter\.com)$/.test(h)) return 'plataforma';
  return 'site';
}

async function analisarSite(urlTxt) {
  const url = normalizarUrl(urlTxt);
  if (!url) throw falha(400, 'Endereço de site inválido.');
  const tipo = tipoDoEndereco(url);
  const base = { url: url.href, tipo, ok: false, https: url.protocol === 'https:', status: 0, erro: '', analisadoEm: Date.now() };

  // Quando o "site" no Google é o próprio Instagram/Facebook/WhatsApp, não tem site de verdade.
  if (tipo === 'instagram') {
    const h = (url.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    return { ...base, ok: true, ...vazio(), instagram: h && !IG_RESERVADO.has(h) ? [h] : [] };
  }
  if (tipo === 'facebook') return { ...base, ok: true, ...vazio(), facebook: [url.pathname.split('/').filter(Boolean)[0] || ''].filter(Boolean) };
  if (tipo === 'whatsapp') {
    const d = (url.pathname + url.search).replace(/\D/g, '');
    return { ...base, ok: true, ...vazio(), whatsapp: d.length >= 10 ? [d] : [] };
  }

  let r;
  try { r = await baixarHtml(url, 9000); }
  catch (e) {
    // muitos sites antigos só abrem em http
    if (url.protocol === 'https:') {
      try { const u2 = new URL(url.href.replace(/^https:/, 'http:')); r = await baixarHtml(u2, 7000); base.https = false; }
      catch (e2) { return { ...base, ...vazio(), erro: 'O site não abriu (fora do ar ou muito lento).' }; }
    } else return { ...base, ...vazio(), erro: 'O site não abriu (fora do ar ou muito lento).' };
  }
  base.status = r.status;
  base.final = r.final;
  base.https = /^https:/i.test(r.final);
  if (r.status >= 400) return { ...base, ...vazio(), erro: `O site respondeu com erro ${r.status}.` };
  const dados = extrairDoHtml(r.texto, r.final);
  if (dados.paginaContato && (!dados.instagram.length || !dados.emails.length || !dados.whatsapp.length || !dados.cnpjs.length)) {
    try {
      const r2 = await baixarHtml(new URL(dados.paginaContato), 6000);
      if (r2.status < 400) {
        const d2 = extrairDoHtml(r2.texto, r2.final);
        for (const k of ['instagram', 'facebook', 'whatsapp', 'emails', 'telefones', 'cnpjs']) dados[k] = unicos(dados[k].concat(d2[k])).slice(0, 6);
        dados.pixelMeta = dados.pixelMeta || d2.pixelMeta; dados.googleTag = dados.googleTag || d2.googleTag; dados.googleAds = dados.googleAds || d2.googleAds;
      }
    } catch (e) { /* segue com o que já tem */ }
  }
  if (tipo === 'agregador') dados.plataforma = dados.plataforma || 'Link na bio';
  return { ...base, ok: true, ...dados };
}
function vazio() { return { instagram: [], facebook: [], whatsapp: [], emails: [], telefones: [], cnpjs: [], pixelMeta: false, googleTag: false, googleAds: false, responsivo: false, titulo: '', plataforma: '' }; }

/* ---------------- 3. CNPJ (dados públicos da Receita) ---------------- */
async function consultarCnpj(cnpjTxt) {
  const d = String(cnpjTxt || '').replace(/\D/g, '');
  if (!digitosCnpjValidos(d)) throw falha(400, 'CNPJ inválido. Confira os 14 números.');
  const fontes = [
    ['BrasilAPI', `https://brasilapi.com.br/api/cnpj/v1/${d}`],
    ['Minha Receita', `https://minhareceita.org/${d}`]
  ];
  let ultimo = '';
  for (const [nome, url] of fontes) {
    try {
      const r = await comPrazo(url, { headers: { Accept: 'application/json', 'User-Agent': 'NostroHub/1.0' } }, 9000);
      if (r.status === 404) throw falha(404, 'Esse CNPJ não foi encontrado na Receita.');
      if (!r.ok) { ultimo = `${nome}: ${r.status}`; continue; }
      const j = await r.json();
      return normalizarCnpj(j, d, nome);
    } catch (e) {
      if (e.status === 404) throw e;
      ultimo = `${nome}: ${e.message || e}`;
    }
  }
  throw falha(502, 'As bases públicas de CNPJ não responderam agora. Tente de novo em alguns minutos.', ultimo);
}
export function normalizarCnpj(j, d, fonte) {
  const porte = j.porte || j.descricao_porte || '';
  return {
    cnpj: d,
    razao: j.razao_social || '',
    fantasia: j.nome_fantasia || '',
    situacao: j.descricao_situacao_cadastral || '',
    abertura: j.data_inicio_atividade || '',
    porte: String(porte).replace(/^DEMAIS$/i, 'Demais (médio/grande)'),
    atividade: j.cnae_fiscal_descricao || '',
    capital: +j.capital_social || 0,
    cidade: j.municipio || '',
    uf: j.uf || '',
    socios: (j.qsa || []).slice(0, 6).map(s => ({ nome: s.nome_socio || s.nome || '', qualificacao: s.qualificacao_socio || s.descricao_qualificacao_socio || '' })).filter(s => s.nome),
    fonte,
    consultadoEm: Date.now()
  };
}

export { geocodificar, buscarOSM, buscarTomTom, analisarSite, consultarCnpj };
