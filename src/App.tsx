import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, Bell, Building2, Check, ChevronDown,
  Globe2, LayoutDashboard, MapPin, MessageCircle, Plus, Search, Settings2,
  Sparkles, Target, Users, X, LoaderCircle, ExternalLink, Radar
} from "lucide-react";

type WebsiteStatus = "website_found" | "website_not_identified" | "verification_pending";
type LeadStatus = "Novo" | "Contatado" | "Interessado" | "Convertido";
type Lead = {
  id: string; name: string; category: string; city: string; phone: string;
  websiteStatus: WebsiteStatus; website: string; score: number; status: LeadStatus;
  source: string; sourceUrl: string; discoveredAt: string;
  address?: string; whatsapp?: string; email?: string; instagram?: string; facebook?: string;
  lat?: number | null; lon?: number | null; openingHours?: string; possibleDuplicate?: boolean;
  duplicateNote?: string; scoreFactors?: { phone: number; website: number; address: number; social: number; openingHours: number };
};
type DiscoveryResult = Omit<Lead, "status">;

const STORAGE_KEY = "leadhunter-ai-leads-v1";
const categories = ["Todos os segmentos", "Restaurantes e cafés", "Lojas e comércio", "Saúde e bem-estar", "Beleza e estética", "Serviços profissionais", "Academias e esportes", "Hospedagem e turismo"];
const labelForWebsite = (status: WebsiteStatus) => status === "website_found" ? "Website encontrado" : status === "website_not_identified" ? "Website não identificado" : "Verificação pendente";
const readSavedLeads = (): Lead[] => {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as Lead[] : []; }
  catch { return []; }
};
const csvCell = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"';

const readableApiError = (value: unknown, status: number) => {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const details = value as Record<string, unknown>;
    for (const key of ["message", "error", "details", "code"]) {
      const candidate = details[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try { return JSON.stringify(value); } catch { /* Fall through to the HTTP status. */ }
  }
  return `A API de prospecção respondeu com HTTP ${status}, mas não enviou uma mensagem de erro legível.`;
};

function App() {
  const [leads, setLeads] = useState<Lead[]>(readSavedLeads);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos os status");
  const [active, setActive] = useState("Visão geral");
  const [city, setCity] = useState("Feira de Santana, BA");
  const [segment, setSegment] = useState("Restaurantes e cafés");
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Serviços profissionais");
  const [newCity, setNewCity] = useState("Feira de Santana, BA");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(leads)); }, [leads]);

  const filtered = useMemo(() => leads.filter((lead) =>
    (lead.name.toLowerCase().includes(query.toLowerCase()) || lead.category.toLowerCase().includes(query.toLowerCase()) || lead.city.toLowerCase().includes(query.toLowerCase())) &&
    (statusFilter === "Todos os status" || lead.status === statusFilter)
  ), [leads, query, statusFilter]);

  const updateStatus = (id: string, next: LeadStatus) => setLeads(old => old.map(lead => lead.id === id ? { ...lead, status: next } : lead));
  const saveResult = (result: DiscoveryResult) => {
    if (leads.some(lead => lead.id === result.id)) { setNotice("Esta empresa já está na sua carteira."); return; }
    setLeads(old => [{ ...result, status: "Novo" }, ...old]);
    setNotice("Empresa salva na sua carteira.");
  };
  const discover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (city.trim().length < 2) { setError("Informe uma cidade válida."); return; }
    setLoading(true); setError(""); setResults([]);
    try {
      const params = new URLSearchParams({ city: city.trim(), category: segment });
      const response = await fetch("/api/discover?" + params.toString(), { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { results?: DiscoveryResult[]; error?: unknown; message?: unknown };
      if (!response.ok) throw new Error(readableApiError(payload.error ?? payload.message ?? payload, response.status));
      if (!Array.isArray(payload.results)) throw new Error("A API respondeu, mas retornou um formato inesperado. Verifique os registros da função /api/discover na Vercel.");
      setResults(payload.results);
      if (!payload.results?.length) setError("Nenhuma empresa foi retornada para essa combinação. Tente outro segmento ou cidade.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada na pesquisa.");
    } finally { setLoading(false); }
  };
  const addManualLead = () => {
    if (!newName.trim() || !newCity.trim()) return;
    const id = "manual-" + crypto.randomUUID();
    setLeads(old => [{ id, name: newName.trim(), category: newCategory, city: newCity.trim(), phone: newPhone.replace(/\D/g, ""), websiteStatus: "verification_pending", website: "", score: 50, status: "Novo", source: "Cadastro manual", sourceUrl: "", discoveredAt: new Date().toISOString() }, ...old]);
    setNewName(""); setNewPhone(""); setShowAdd(false); setNotice("Lead adicionado à carteira.");
  };
  const exportCsv = () => {
    const rows = [["Empresa", "Segmento", "Cidade", "Endereço", "Telefone", "WhatsApp", "E-mail", "Instagram", "Facebook", "Website", "URL do website", "Status comercial", "Score", "Possível duplicidade", "Fonte", "Evidência", "Data da descoberta"],
      ...filtered.map(lead => [lead.name, lead.category, lead.city, lead.address || "", lead.phone, lead.whatsapp || "", lead.email || "", lead.instagram || "", lead.facebook || "", labelForWebsite(lead.websiteStatus), lead.website, lead.status, lead.score, lead.possibleDuplicate ? "Revisar" : "Não sinalizada", lead.source, lead.sourceUrl, lead.discoveredAt])];
    const csv = rows.map(row => row.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "leadhunter-leads.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  const nav = [{ name: "Visão geral", icon: LayoutDashboard }, { name: "Descobrir leads", icon: Target }, { name: "Minha carteira", icon: Users }];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Target size={19}/></div><div><b>lead<span>hunter</span></b><small>INTELLIGENCE SUITE</small></div></div>
      <div className="workspace"><div className="workspace-icon">L</div><div><b>LeadHunter AI</b><small>Workspace principal</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.name} className={active === item.name ? "nav-item selected" : "nav-item"} onClick={() => setActive(item.name)}><item.icon size={17}/>{item.name}</button>)}</nav>
      <div className="nav-label tools-label">PREFERÊNCIAS</div>
      <button className="nav-item" onClick={() => setNotice("Configurações avançadas serão habilitadas com a camada de autenticação.")}><Settings2 size={17}/>Configurações</button>
      <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={16}/></div><b>Prospecção com evidências</b><p>Descubra empresas mapeadas e valide cada oportunidade antes do contato.</p><button onClick={() => setActive("Descobrir leads")}>Abrir radar <ArrowUpRight size={13}/></button></div><div className="profile"><div className="avatar">L</div><div><b>Seu workspace</b><small>Ambiente inicial</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{active}</b></div><div className="top-actions"><div className="live"><i/> Pesquisa por fonte pública</div><button className="icon-button" aria-label="Notificações"><Bell size={18}/></button><div className="avatar small">L</div></div></header>
      <div className="content">
        <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={13}/> INTELIGÊNCIA COMERCIAL</div><h1>Encontre oportunidades<br/><span>antes da concorrência.</span></h1><p className="subtitle">Descubra negócios locais e organize sua prospecção em um só lugar.</p></div><button className="primary-btn" onClick={() => setShowAdd(true)}><Plus size={17}/> Adicionar lead</button></div>

        <section className="hero-strip"><div className="hero-glow"/><div className="hero-copy"><div className="hero-tag"><span/> RADAR DE OPORTUNIDADES</div><h2>Empresas reais. Fontes rastreáveis.</h2><p>Pesquise estabelecimentos mapeados por cidade e segmento. Cada resultado inclui sua fonte e o status observado do website.</p><button onClick={() => setActive("Descobrir leads")}>Começar uma descoberta <ArrowUpRight size={15}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orb-center"><Radar size={31}/></div><div className="float-card card-a"><Globe2 size={15}/><span>Dados públicos</span><b>Com evidências</b></div><div className="float-card card-b"><Activity size={15}/><span>Carteira</span><b>{leads.length} leads</b></div></div></section>

        <div className="section-heading"><div><h3>Visão geral</h3><p>Indicadores calculados a partir da sua carteira salva.</p></div><span className="date-chip">Atualizado automaticamente</span></div>
        <div className="metrics">
          <div className="metric"><div className="metric-top"><span>Leads na carteira</span><span className="metric-icon purple"><Users size={17}/></span></div><div className="metric-value">{leads.length.toString().padStart(2, "0")}<small> empresas</small></div><div className="metric-foot"><span>Dados salvos</span></div></div>
          <div className="metric"><div className="metric-top"><span>Website não identificado</span><span className="metric-icon blue"><Globe2 size={17}/></span></div><div className="metric-value">{leads.filter(l => l.websiteStatus === "website_not_identified").length.toString().padStart(2, "0")}<small> empresas</small></div><div className="metric-foot"><span>Requer validação manual</span></div></div>
          <div className="metric"><div className="metric-top"><span>Em negociação</span><span className="metric-icon amber"><MessageCircle size={17}/></span></div><div className="metric-value">{leads.filter(l => l.status === "Interessado").length.toString().padStart(2, "0")}<small> leads</small></div><div className="metric-foot"><span>Interessados</span></div></div>
          <div className="metric"><div className="metric-top"><span>Convertidos</span><span className="metric-icon green"><Check size={17}/></span></div><div className="metric-value">{leads.filter(l => l.status === "Convertido").length.toString().padStart(2, "0")}<small> leads</small></div><div className="metric-foot"><span>Vendas registradas</span></div></div>
        </div>

        <section className="discovery-panel">
          <div className="section-heading"><div><div className="eyebrow"><Radar size={13}/> PESQUISA DE EMPRESAS</div><h3>Descobrir novos leads</h3><p>Consulta a base colaborativa do OpenStreetMap. Cobertura varia por localidade.</p></div></div>
          <form className="discovery-form" onSubmit={discover}>
            <label>Cidade, estado<input value={city} onChange={e => setCity(e.target.value)} placeholder="Ex.: Feira de Santana, BA" required minLength={2}/></label>
            <label>Segmento<select value={segment} onChange={e => setSegment(e.target.value)}>{categories.slice(1).map(value => <option key={value}>{value}</option>)}</select></label>
            <button className="primary-btn" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} {loading ? "Pesquisando..." : "Pesquisar empresas"}</button>
          </form>
          {error && <div className="search-message">{error}</div>}
          {results.length > 0 && <div className="results-block"><div className="results-title"><b>{results.length} empresas encontradas</b><span>Revise antes de salvar</span></div><div className="result-list">{results.map(result => <div className="result-row" key={result.id}><div className="result-icon"><Building2 size={17}/></div><div className="result-main"><b>{result.name}</b><small>{result.category} · {result.city}</small><small className="evidence">Fonte: OpenStreetMap · {labelForWebsite(result.websiteStatus)} · Score {result.score}/95</small><small className="evidence">Pontuação: telefone +{result.scoreFactors?.phone ?? 0} · website +{result.scoreFactors?.website ?? 0} · endereço +{result.scoreFactors?.address ?? 0} · redes +{result.scoreFactors?.social ?? 0} · horário +{result.scoreFactors?.openingHours ?? 0}</small>{(result.phone || result.email || result.address) && <small className="evidence">{[result.phone, result.email, result.address].filter(Boolean).join(" · ")}</small>}{result.possibleDuplicate && <small className="evidence">⚠ Possível duplicidade: revise antes de salvar</small>}</div>{result.website && <a href={result.website} target="_blank" rel="noreferrer" className="result-link" aria-label="Abrir website"><ExternalLink size={15}/></a>}{result.whatsapp && <a href={"https://wa.me/" + result.whatsapp.replace(/\D/g, "")} target="_blank" rel="noreferrer" className="result-link" aria-label="Abrir WhatsApp"><MessageCircle size={15}/></a>}{result.email && <a href={"mailto:" + result.email} className="result-link" aria-label="Enviar e-mail"><span>@</span></a>}{result.instagram && <a href={result.instagram} target="_blank" rel="noreferrer" className="result-link" aria-label="Abrir Instagram"><span>IG</span></a>}{result.facebook && <a href={result.facebook} target="_blank" rel="noreferrer" className="result-link" aria-label="Abrir Facebook"><span>f</span></a>}<a href={result.sourceUrl} target="_blank" rel="noreferrer" className="result-link" aria-label="Ver fonte"><MapPin size={15}/></a><button className="save-result" onClick={() => saveResult(result)} disabled={leads.some(lead => lead.id === result.id)}>{leads.some(lead => lead.id === result.id) ? <Check size={14}/> : <Plus size={14}/>} {leads.some(lead => lead.id === result.id) ? "Salvo" : "Salvar"}</button></div>)}</div><p className="attribution">Dados © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · O status “website não identificado” significa apenas que não há URL cadastrada nessa fonte, não que a empresa não possua site.</p></div>}
        </section>

        <div className="section-heading leads-heading"><div><h3>Minha carteira</h3><p>Gerencie o relacionamento e acompanhe o pipeline.</p></div><button className="text-btn" onClick={exportCsv}><ArrowDownToLine size={14}/> Exportar CSV</button></div>
        <div className="filters"><div className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar empresa, cidade ou segmento..."/></div><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>Todos os status</option>{["Novo", "Contatado", "Interessado", "Convertido"].map(value => <option key={value}>{value}</option>)}</select><button className="filter-btn" onClick={() => { setQuery(""); setStatusFilter("Todos os status"); }}>Limpar filtros</button></div>
        <div className="table-wrap"><table><thead><tr><th>EMPRESA</th><th>SEGMENTO</th><th>LOCALIZAÇÃO</th><th>PRESENÇA DIGITAL</th><th>FONTE</th><th>STATUS</th><th></th></tr></thead><tbody>{filtered.map(lead => <tr key={lead.id}><td><div className="company"><div className="company-logo violet">{lead.name.slice(0, 2).toUpperCase()}</div><div><b>{lead.name}</b><small>{lead.phone || "Telefone não informado"}</small></div></div></td><td>{lead.category}</td><td><span className="location"><MapPin size={13}/>{lead.city}</span></td><td><span className={"site-status " + (lead.websiteStatus === "website_found" ? "has-site" : lead.websiteStatus === "website_not_identified" ? "no-site" : "check-site")}><i/>{labelForWebsite(lead.websiteStatus)}</span>{lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="website-inline">Abrir</a>}</td><td>{lead.sourceUrl ? <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="source-link">Ver evidência <ExternalLink size={11}/></a> : lead.source}</td><td><select className={"status-select status-" + lead.status.toLowerCase()} value={lead.status} onChange={e => updateStatus(lead.id, e.target.value as LeadStatus)}><option>Novo</option><option>Contatado</option><option>Interessado</option><option>Convertido</option></select></td><td><button className="row-action" title="Abrir conversa no WhatsApp" onClick={() => { if (!lead.phone) { setNotice("Esta empresa não possui telefone cadastrado na fonte."); return; } window.open("https://wa.me/" + lead.phone.replace(/\D/g, "") + "?text=" + encodeURIComponent("Olá! Encontrei o perfil da " + lead.name + " e gostaria de apresentar uma ideia para fortalecer sua presença digital. Podemos conversar?"), "_blank", "noopener,noreferrer"); }}><ArrowUpRight size={16}/></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">{leads.length === 0 ? "Sua carteira ainda está vazia. Pesquise empresas no radar ou adicione um lead manualmente." : "Nenhum lead corresponde aos filtros selecionados."}</div>}</div>
        <div className="footnote"><div><span className="demo-dot"/> Os leads são armazenados neste navegador.</div><span>Fontes públicas podem estar incompletas. Confirme os dados antes de qualquer abordagem comercial.</span></div>
        <footer>© 2026 LeadHunter AI <span>Descoberta responsável. Prospecção inteligente.</span><span className="footer-right">Dados de fontes públicas · OpenStreetMap</span></footer>
      </div>
    </main>
    {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">NOVA OPORTUNIDADE</span><h3>Adicionar empresa</h3></div><button className="icon-button" onClick={() => setShowAdd(false)}><X size={18}/></button></div><label>Nome da empresa<input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex.: Café Central" required/></label><label>Segmento<select value={newCategory} onChange={e => setNewCategory(e.target.value)}>{categories.slice(1).map(value => <option key={value}>{value}</option>)}</select></label><label>Cidade<input value={newCity} onChange={e => setNewCity(e.target.value)} required/></label><label>Telefone<input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="DDD + número"/></label><div className="modal-actions"><button className="secondary-btn" onClick={() => setShowAdd(false)}>Cancelar</button><button className="primary-btn" onClick={addManualLead} disabled={!newName.trim() || !newCity.trim()}>Salvar lead <ArrowUpRight size={15}/></button></div></div></div>}
    {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={() => setNotice("")}><X size={14}/></button></div>}
  </div>;
}
export default App;
