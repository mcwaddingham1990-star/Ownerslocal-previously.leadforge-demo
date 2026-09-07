import React, { useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { buildStyleGuidance } from "../lib/aiStyle";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Sparkles,
  Bot,
  Database,
  History,
  FileText,
  Play,
  Settings,
  Cpu,
  TrendingUp,
  BarChart2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  HelpCircle,
  Save,
  Sliders,
  Layers,
  ChevronRight,
  RefreshCw,
  Clock,
  ArrowRight,
  Download,
  PlusSquare,
  AlertCircle,
  Check,
  Undo2
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";

interface AIAssistantPageProps {
  globalAiSetting: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO";
  setGlobalAiSetting: (val: "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO") => void;
  moduleAiSettings: Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">;
  setModuleAiSettings: React.Dispatch<React.SetStateAction<Record<string, "OFF" | "ASSIST" | "ASSIST + APPROVAL" | "AUTO" | "DEFAULT">>>;
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  globalAiSetting,
  setGlobalAiSetting,
  moduleAiSettings,
  setModuleAiSettings
}) => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const { recentAiActions, setRecentAiActions, customers, leads, schedulingEvents, employees, invoices, transactions, aiKnowledgeBase, setAiKnowledgeBase } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    logOperationalEvent,
    triggerNotification
  } = useNavTelemetry();
  const [activeTab, setActiveTab] = useState<"command" | "reports" | "config" | "insights" | "settings">("command");
  
  // Real, persisted config (src/App.tsx auto-saves this to Firestore
  // whenever it changes, and feeds it into every AI request as
  // styleGuidance -- see resolveAiMode/buildStyleGuidance there).
  const { selectedKBDoc, creativityLevel, aiTone, styleNotes } = aiKnowledgeBase;
  const setSelectedKBDoc = (value: string) => setAiKnowledgeBase(prev => ({ ...prev, selectedKBDoc: value }));
  const setCreativityLevel = (value: number) => setAiKnowledgeBase(prev => ({ ...prev, creativityLevel: value }));
  const setAiTone = (value: string) => setAiKnowledgeBase(prev => ({ ...prev, aiTone: value }));
  const setStyleNotes = (value: string) => setAiKnowledgeBase(prev => ({ ...prev, styleNotes: value }));
  const [showSaveToast, setShowSaveToast] = useState<boolean>(false);

  // Real reports generated on-demand from this account's actual data (session-local, not a fake pre-seeded library).
  const [reportsList, setReportsList] = useState<Array<{ id: string; title: string; date: string; content: string }>>([]);
  const [isCompilingReport, setIsCompilingReport] = useState(false);

  // The page's own header says "Ask it anything" but nothing on this page
  // ever collected a question -- the five tabs are all read-only dashboards
  // (activity log, reports, config, settings). This is the real, direct
  // question box that was missing.
  const [askInput, setAskInput] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  const handleAskQuestion = async () => {
    const question = askInput.trim();
    if (!question || askLoading) return;
    setAskLoading(true);
    setAskAnswer(null);
    const businessSummary = [
      `Customers on file: ${customers.length}.`,
      `Open leads: ${leads.length}.`,
      `Scheduling events on file: ${schedulingEvents.length}.`,
      `Employees on roster: ${employees.length}.`,
      `Invoices on file: ${invoices.length}.`,
      `Logged transactions: ${transactions.length}.`
    ].join(" ");
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: "ai_assistant",
          pageName: "AI Assistant",
          isOwnerOrAdmin: activeRole === "Owner" || activeRole === "Admin",
          businessSummary,
          styleGuidance: buildStyleGuidance(aiKnowledgeBase),
          query: question
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setAskAnswer(data.text || "No response.");
      logOperationalEvent("AI Question Asked", question, "💬");
    } catch (err) {
      setAskAnswer(`⚠️ Couldn't reach the AI right now: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setAskLoading(false);
    }
  };

  // Real weekly rollup of the actual AI action ledger -- no fabricated telemetry.
  const chartsData = useMemo(() => {
    const days: { key: string; name: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: d.toISOString().slice(0, 10), name: d.toLocaleDateString([], { weekday: "short" }) });
    }
    return days.map(d => {
      const dayActions = recentAiActions.filter((a: any) => a.date === d.key);
      return {
        name: d.name,
        "AI Actions Logged": dayActions.length,
        "Completed": dayActions.filter((a: any) => a.status === "Completed").length
      };
    });
  }, [recentAiActions]);

  const handleCompileAudit = async () => {
    setIsCompilingReport(true);
    logOperationalEvent("AI Reports", "Compiled a new performance audit from live account data.", "📋");
    const businessSummary = [
      `Customers on file: ${customers.length}.`,
      `Open leads: ${leads.length}.`,
      `Scheduling events on file: ${schedulingEvents.length}.`,
      `Employees on roster: ${employees.length}.`,
      `Invoices on file: ${invoices.length}.`,
      `Logged transactions: ${transactions.length}.`,
      `AI actions logged (all time): ${recentAiActions.length}, of which ${recentAiActions.filter((a: any) => a.status === "Undone").length} were undone.`
    ].join(" ");

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: "ai_assistant",
          pageName: "AI Assistant",
          isOwnerOrAdmin: true,
          businessSummary,
          styleGuidance: buildStyleGuidance(aiKnowledgeBase),
          query: "Write a short operational audit report for the business owner covering current pipeline, staffing, and financial activity levels, using only the real figures given above. If a section has no data, say so plainly instead of inventing anything."
        })
      });
      const data = await res.json();
      setReportsList(prev => [{
        id: `rep_${Date.now()}`,
        title: `Operational Audit — ${new Date().toLocaleDateString()}`,
        date: new Date().toLocaleDateString(),
        content: data.text || "No response."
      }, ...prev]);
    } catch {
      triggerNotification("Couldn't reach the AI right now — check your connection and try again.");
    } finally {
      setIsCompilingReport(false);
    }
  };

  const handleDownloadReport = (rep: { title: string; content: string }) => {
    const blob = new Blob([rep.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rep.title.replace(/[^a-z0-9]+/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logOperationalEvent("AI Report Download", `Downloaded report: ${rep.title}`, "📥");
  };

  // aiKnowledgeBase already lives in App.tsx and auto-saves to Firestore
  // on every change (see the useEffect there) -- this button is just a
  // clear, explicit confirmation that the current values are the saved
  // ones, not a separate save path.
  const handleSaveConfig = () => {
    setShowSaveToast(true);
    logOperationalEvent("AI Config", "OwnersLOCAL Global AI Knowledge database and tone configs saved.", "⚙️");
    setTimeout(() => setShowSaveToast(false), 3000);
  };

  const handleUndoAction = (id: string) => {
    setRecentAiActions(prev => prev.map(act => {
      if (act.id === id) {
        return { ...act, status: "Undone" as const };
      }
      return act;
    }));
    const actObj = recentAiActions.find(a => a.id === id);
    if (actObj) {
      logOperationalEvent("AI Undo", `Reverted action: ${actObj.action} in ${actObj.module}`, "↩️");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* HEADER HERO AREA */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1F3557] to-[#4A86F7] text-white flex items-center justify-center text-2xl font-bold shadow-md">
            🤖
          </div>
          <div>
            <h2 className="text-lg font-sans font-extrabold text-[#1F3557] uppercase tracking-wider flex items-center gap-2">
              Your Business Assistant
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold">
              Ask it anything, run reports, and get real answers from your own business data
            </p>
          </div>
        </div>
        
        {/* Quick Snapshot Action */}
        <button
          onClick={() => {
            if (onTakeSnapshot) onTakeSnapshot("ai_assistant", "AI Assistant");
          }}
          className="px-4 py-2 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-xl text-xs font-bold text-[#315C9F] flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Save Snapshot</span>
        </button>
      </div>

      {/* ASK A QUESTION -- the direct query input the header promises but the tabs below never provided */}
      <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={askInput}
            onChange={e => setAskInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAskQuestion()}
            placeholder="Ask about your business -- e.g. 'Which customers are past due?'"
            className="flex-1 text-xs bg-white border border-[#9EC8EF] rounded-xl px-4 py-3 focus:outline-none focus:border-[#4A86F7] font-semibold text-[#1F3557]"
          />
          <button
            onClick={handleAskQuestion}
            disabled={!askInput.trim() || askLoading}
            className="px-5 py-3 bg-[#1F3557] hover:bg-[#162740] disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {askLoading ? "Asking…" : "Ask"}
          </button>
        </div>
        {askAnswer && (
          <div className="bg-white border border-[#9EC8EF]/60 rounded-2xl p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-line">
            {askAnswer}
          </div>
        )}
      </div>

      {/* NAVIGATION TABS BAR */}
      <div className="flex flex-wrap gap-1.5 border-b border-[#9EC8EF]/40 pb-2.5">
        {[
          { id: "command", label: "Activity Log", icon: <History className="w-4 h-4" /> },
          { id: "reports", label: "Reports", icon: <FileText className="w-4 h-4" /> },
          { id: "insights", label: "This Week", icon: <BarChart2 className="w-4 h-4" /> },
          { id: "config", label: "What It Knows", icon: <Database className="w-4 h-4" /> },
          { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border ${
              activeTab === tab.id
                ? "bg-[#1F3557] text-white border-[#1F3557] shadow-sm"
                : "bg-white text-[#5E7393] border-[#9EC8EF] hover:bg-[#EAF5FF] hover:text-[#1F3557]"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* INTERACTIVE CONTENT VIEWPORT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: ACTIVE WORKSPACE TAB CARD */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CONVERSATION HISTORY TAB */}
          {activeTab === "command" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
                <div>
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">What's Been Done</h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">A running log of everything your assistant has handled across the app.</p>
                </div>
                <span className="text-[10px] bg-white text-[#315C9F] border border-[#A9CDEE] px-2.5 py-1 rounded-xl font-mono font-bold">
                  {recentAiActions.length} Logged
                </span>
              </div>

              {recentAiActions.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-3xl">🤖</p>
                  <p className="text-xs font-bold text-slate-500">No AI activity yet</p>
                  <p className="text-[10.5px] text-slate-400 max-w-sm mx-auto">Use any AI-powered feature and it'll show up here. You can undo anything from this list.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentAiActions.map((log: any) => (
                    <div key={log.id} className="p-4 bg-white border border-[#9EC8EF]/40 hover:border-[#315C9F] rounded-2xl flex justify-between gap-4 transition-all">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF]/40 rounded text-[9px] font-mono font-bold uppercase">
                            {log.module}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold font-mono">{log.date} {log.time}</span>
                        </div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide truncate">{log.action}</h4>
                        <p className="text-slate-500 text-[11px] leading-relaxed line-clamp-2 font-sans font-medium">{log.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI REPORTS TAB */}
          {activeTab === "reports" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-[#A9CDEE] pb-3">
                <div>
                  <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">Business Reports</h3>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Get a plain-English summary of where your business stands right now.</p>
                </div>
                <button
                  onClick={handleCompileAudit}
                  disabled={isCompilingReport}
                  className="px-3 py-1.5 bg-[#4A9BFF] hover:bg-[#3583E6] disabled:opacity-60 text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1 shadow-sm transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isCompilingReport ? "animate-spin" : ""}`} />
                  <span>{isCompilingReport ? "Pulling your data..." : "Run Report"}</span>
                </button>
              </div>

              {reportsList.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-3xl">📋</p>
                  <p className="text-xs font-bold text-slate-500">No reports yet</p>
                  <p className="text-[10.5px] text-slate-400 max-w-sm mx-auto">Hit "Run Report" and your assistant will pull together a straight-talk summary of your pipeline, team, and finances using your real data.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reportsList.map((rep) => (
                    <div key={rep.id} className="p-4 bg-white border border-[#9EC8EF]/40 rounded-2xl flex flex-col justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-[#4A9BFF] font-bold uppercase">AI Report</span>
                          <span className="text-[9px] text-slate-400 font-mono">{rep.date}</span>
                        </div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider leading-snug">{rep.title}</h4>
                        <p className="text-[10.5px] text-slate-500 leading-relaxed line-clamp-3 font-sans font-medium">{rep.content}</p>
                      </div>

                      <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                        <button
                          onClick={() => handleDownloadReport(rep)}
                          className="p-1.5 bg-[#EAF5FF] hover:bg-[#315C9F] text-[#315C9F] hover:text-white border border-[#9EC8EF] hover:border-transparent rounded-lg transition-colors cursor-pointer"
                          title="Download Report"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BUSINESS INSIGHTS TAB */}
          {activeTab === "insights" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="border-b border-[#A9CDEE] pb-3">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">This Week at a Glance</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">See how much your assistant has been doing across the app this week.</p>
              </div>

              {/* Chart Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/30 h-64">
                  <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 text-left">Today's Usage</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={chartsData}>
                      <defs>
                        <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#315C9F" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#315C9F" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="AI Actions Logged" stroke="#315C9F" fillOpacity={1} fill="url(#colorAI)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/30 h-64">
                  <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-2 text-left">Actions Completed</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={chartsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={9} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="Completed" fill="#4A86F7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* KPI metrics row -- real counts derived from the actual AI action ledger */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Total Things Done", value: String(recentAiActions.length), desc: "Everything your assistant has handled since you got started." },
                  { label: "Done This Week", value: String(chartsData.reduce((s, d) => s + d["Completed"], 0)), desc: "Tasks your assistant wrapped up in the last 7 days." },
                  { label: "Reversed", value: String(recentAiActions.filter((a: any) => a.status === "Undone").length), desc: "Things you chose to undo — no hard feelings." }
                ].map((kpi, kIdx) => (
                  <div key={kIdx} className="bg-white p-3.5 rounded-2xl border border-[#9EC8EF]/40 flex flex-col justify-between">
                    <div>
                      <p className="text-[9px] font-extrabold text-[#5E7393] uppercase tracking-wider">{kpi.label}</p>
                      <p className="text-lg font-black text-[#1F3557] mt-1">{kpi.value}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-sans font-medium mt-1 leading-normal text-left">{kpi.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KNOWLEDGE BASE CONFIG */}
          {activeTab === "config" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="border-b border-[#A9CDEE] pb-3">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">What Your Assistant Knows</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Tell it what to reference when answering questions or making suggestions.</p>
              </div>

              <div className="space-y-4 text-left">
                {/* Knowledge Base Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: "pricebook", label: "Your Price Book", icon: "💰", details: "Your standard job pricing, line items, and labor rates — so it quotes accurately." },
                    { id: "codes", label: "Building & Trade Codes", icon: "🚰", details: "Local code requirements, safety clearances, and compliance rules for your trade." },
                    { id: "safety", label: "Safety Guidelines", icon: "🛡️", details: "Your safety checklists and protocols — so it never overlooks the important stuff." }
                  ].map((kb) => (
                    <button
                      key={kb.id}
                      onClick={() => setSelectedKBDoc(kb.id)}
                      className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
                        selectedKBDoc === kb.id
                          ? "bg-[#1F3557] text-white border-transparent shadow-md"
                          : "bg-white text-slate-700 border-[#9EC8EF]/40 hover:bg-[#EAF5FF]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xl select-none">{kb.icon}</span>
                        {selectedKBDoc === kb.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-wider mt-2.5">{kb.label}</h4>
                      <p className={`text-[10px] leading-relaxed mt-1 font-sans font-medium ${selectedKBDoc === kb.id ? "text-slate-300" : "text-slate-500"}`}>{kb.details}</p>
                    </button>
                  ))}
                </div>

                {/* Creativity levels & sliders */}
                <div className="bg-white p-5 rounded-2xl border border-[#9EC8EF]/40 space-y-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Fine-Tune How It Thinks</h4>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10.5px] font-bold text-[#5E7393]">
                      <span>HOW CREATIVE SHOULD IT BE?</span>
                      <span className="font-mono text-[#315C9F]">{creativityLevel}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={creativityLevel}
                      onChange={(e) => setCreativityLevel(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#315C9F]"
                    />
                    <p className="text-[9px] text-slate-400 font-sans font-semibold">
                      Keep it low for straight numbers and facts. Turn it up when drafting proposals, messages, or anything that benefits from a little personality.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">How Should It Talk to You?</label>
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value)}
                      className="w-full bg-[#EAF5FF] border border-[#9EC8EF] text-xs font-bold text-[#1F3557] rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                    >
                      <option value="analytical">Straight to the point (default)</option>
                      <option value="supportive">Friendly and encouraging</option>
                      <option value="brutalist">Short and blunt — just the facts</option>
                      <option value="sales">Sales-minded — always closing</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-[#5E7393]">Your bidding/writing style notes</label>
                    <textarea
                      value={styleNotes}
                      onChange={(e) => setStyleNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g. Always round estimates to the nearest $50. Mention our 2-year warranty on every quote. Keep invoice notes short and professional, no exclamation points."
                      className="w-full bg-[#EAF5FF] border border-[#9EC8EF] text-xs font-medium text-[#1F3557] rounded-xl px-3 py-2 focus:outline-none resize-none"
                    />
                    <p className="text-[9px] text-slate-400 font-sans font-semibold">
                      Sent with every AI request so drafts, estimates, and answers actually follow your real preferences instead of a generic voice.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={handleSaveConfig}
                      className="px-4 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GLOBAL AI SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="bg-[#C7E3FB] rounded-3xl p-5 border border-[#A9CDEE] space-y-4 shadow-sm">
              <div className="border-b border-[#A9CDEE] pb-3">
                <h3 className="text-xs font-extrabold text-[#342D7E] uppercase tracking-wider">How Much Should It Do?</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Set a default for how involved your assistant is across the whole app. You can override any section below.</p>
              </div>

              <div className="space-y-5 text-left">
                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/40 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
                    <Sliders className="w-4 h-4 text-[#315C9F]" /> Default Setting
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-normal font-sans font-medium">
                    This is the fallback for every section that hasn't been set individually.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
                    {[
                      { id: "OFF", label: "OFF", desc: "No AI involvement." },
                      { id: "ASSIST", label: "ASSIST", desc: "Shows suggestions — you still decide." },
                      { id: "ASSIST + APPROVAL", label: "ASSIST + APP.", desc: "Does the work, but asks before saving." },
                      { id: "AUTO", label: "AUTO", desc: "Handles it on its own without asking." }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setGlobalAiSetting(mode.id as any);
                          logOperationalEvent("AI Config", `Global fallback baseline mode updated to ${mode.id}.`, "🤖");
                        }}
                        className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
                          globalAiSetting === mode.id
                            ? "bg-[#315C9F] text-white border-transparent shadow-sm"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#EAF5FF]"
                        }`}
                      >
                        <span className="text-xs font-black tracking-wider uppercase">{mode.label}</span>
                        <p className={`text-[9px] leading-tight mt-1.5 font-sans font-semibold ${globalAiSetting === mode.id ? "text-slate-200" : "text-slate-400"}`}>{mode.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#9EC8EF]/40 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Per-Section Settings</h4>
                  <p className="text-[11px] text-slate-500 font-sans font-medium">
                    Override the default for any section where you want a different level of involvement.
                  </p>

                  <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
                    {[
                      { key: "dashboard", label: "Dashboard" },
                      { key: "revenue", label: "Revenue" },
                      { key: "customers", label: "Customers" },
                      { key: "leads", label: "Leads" },
                      { key: "estimates", label: "Estimates" },
                      { key: "scheduling", label: "Scheduling" },
                      { key: "dispatch", label: "Dispatch" },
                      { key: "inventory", label: "Inventory" },
                      { key: "documents", label: "Documents" },
                      { key: "messages", label: "Messages" },
                      { key: "training", label: "Training" }
                    ].map((mod) => (
                      <div key={mod.key} className="flex items-center justify-between p-2.5 hover:bg-slate-50/50 rounded-xl border border-slate-100 bg-white">
                        <span className="text-xs font-bold text-slate-700 font-sans">{mod.label}</span>
                        <select
                          value={moduleAiSettings[mod.key] || "DEFAULT"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setModuleAiSettings(prev => ({ ...prev, [mod.key]: val as any }));
                            logOperationalEvent("AI Config", `Override for '${mod.label}' updated to ${val}.`, "⚙️");
                          }}
                          className="text-[10px] font-bold text-[#1F3557] bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] rounded-lg px-2.5 py-1 focus:outline-none cursor-pointer font-sans"
                        >
                          <option value="DEFAULT">INHERIT DEFAULT ({globalAiSetting})</option>
                          <option value="OFF">OFF</option>
                          <option value="ASSIST">ASSIST</option>
                          <option value="ASSIST + APPROVAL">ASSIST + APPROVAL</option>
                          <option value="AUTO">AUTO (AUTONOMOUS)</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: RECENT ACTIONS PANEL */}
        <div className="space-y-6 text-left">
          
          {/* QUICK SYSTEM STATS */}
          <div className="bg-[#1F3557] text-white p-5 rounded-3xl border border-[#1F3557] shadow-lg flex flex-col justify-between h-44 relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 select-none text-[120px] font-black">
              AI
            </div>
            <div className="space-y-1">
              <span className="text-[9.5px] bg-[#4A86F7] text-white px-2 py-0.5 rounded font-black tracking-widest uppercase">
                Core Engine Status
              </span>
              <h3 className="text-base font-extrabold uppercase mt-1.5 tracking-wider">Active Workspace AI</h3>
              <p className="text-[10.5px] text-slate-300 leading-normal font-sans font-medium">
                Owner's AI watches active module screens, syncing real-time inputs to optimize task proposal flows.
              </p>
            </div>
            
            <div className="flex items-center justify-between text-xs font-bold font-mono pt-2 border-t border-white/10 mt-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> CONNECTED
              </span>
              <span className="text-slate-300">Powered by Gemini</span>
            </div>
          </div>

          {/* RECENT AI ACTIONS LEDGER */}
          <div className="bg-white rounded-3xl p-5 border border-[#9EC8EF]/40 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-black text-[#1F3557] uppercase tracking-wider">Recent Activity</h3>
                <p className="text-[10px] text-slate-400 font-sans font-medium">Hit undo on anything you want to walk back.</p>
              </div>
              <span className="text-[9px] bg-[#EAF5FF] text-[#315C9F] border border-[#9EC8EF]/30 px-2 py-0.5 rounded font-mono font-black">
                {recentAiActions.filter(a => a.status === "Completed").length} Active
              </span>
            </div>

            <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin">
              {recentAiActions.map((act) => (
                <div key={act.id} className={`p-3.5 rounded-2xl border transition-all ${
                  act.status === "Undone" 
                    ? "bg-rose-50/50 border-rose-100 text-slate-400" 
                    : "bg-[#F5FAFF] border-[#9EC8EF]/40 text-slate-700 hover:border-[#315C9F]"
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[8.5px] rounded font-mono font-bold uppercase">
                          {act.module}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[8.5px] rounded font-mono font-bold uppercase border ${
                          act.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          act.status === "Pending Approval" ? "bg-amber-50 text-amber-700 border-amber-100" :
                          "bg-rose-100 text-rose-700 border-rose-200"
                        }`}>
                          {act.status}
                        </span>
                      </div>
                      <p className="text-[8.5px] text-slate-400 font-mono font-bold mt-1">{act.date} • {act.time}</p>
                    </div>
                    
                    {act.status !== "Undone" && (
                      <button
                        onClick={() => handleUndoAction(act.id)}
                        className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-100 rounded-lg text-[9px] font-black transition-colors uppercase tracking-wider flex items-center gap-0.5 cursor-pointer"
                        title="Revert decision"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                        <span>Undo</span>
                      </button>
                    )}
                  </div>

                  <h4 className={`text-xs font-extrabold uppercase mt-2 ${act.status === "Undone" ? "line-through" : "text-slate-800"}`}>
                    {act.action}
                  </h4>
                  <p className="text-[10.5px] leading-relaxed mt-1 text-slate-500 font-sans font-medium">{act.reason}</p>
                  
                  {act.approvedBy && (
                    <p className="text-[9.5px] text-[#4A86F7] font-mono font-bold mt-1.5 pt-1.5 border-t border-slate-100/60">
                      Approved By: {act.approvedBy}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* FLOATING SAVE CONFIRMATION TOAST */}
      {showSaveToast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-emerald-500/30 shadow-[0_10px_30px_rgba(16,185,129,0.2)] rounded-2xl px-4 py-3.5 flex items-center gap-3 z-50 text-xs md:text-sm animate-fade-in text-slate-100 max-w-sm">
          <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
            <CheckSquareIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-white mb-0.5">Settings Saved</p>
            <p className="text-slate-400 font-medium text-xs leading-tight">Your assistant will use these settings going forward.</p>
          </div>
        </div>
      )}

    </div>
  );
};

// Simple inline helper icon for checkmark
const CheckSquareIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
