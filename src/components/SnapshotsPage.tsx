import React, { useState, useMemo } from "react";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  Folder,
  FileText,
  Trash2,
  Download,
  Calendar,
  Sparkles,
  Search,
  ArrowLeft,
  Grid,
  List,
  Eye,
  Info,
  Database,
  Camera,
  Activity,
  UserCheck
} from "lucide-react";

export interface Snapshot {
  id: string;
  pageId: string;
  pageName: string;
  timestamp: string;
  filename: string;
  fileSize: string;
  meta: {
    recordCount: number;
    filters: string;
    details: string;
  };
  image?: string;
}

export const SnapshotsPage: React.FC = () => {
  const { snapshots } = useDomainData();
  const { deleteSnapshot: onDeleteSnapshot, openPageAIAnalysis: onOpenAIAnalysis } = useNavTelemetry();
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);

  // Group snapshots by pageId to represent folders
  const folders = useMemo(() => {
    const counts: Record<string, { count: number; name: string }> = {
      dashboard: { count: 0, name: "Dashboard" },
      customers: { count: 0, name: "Customers" },
      leads: { count: 0, name: "Leads" }
    };

    snapshots.forEach((snap) => {
      if (counts[snap.pageId]) {
        counts[snap.pageId].count++;
      } else {
        counts[snap.pageId] = { count: 1, name: snap.pageName };
      }
    });

    return Object.entries(counts).map(([id, info]) => ({
      id,
      name: info.name,
      count: info.count
    }));
  }, [snapshots]);

  // Filter snapshots based on current directory and search query
  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((snap) => {
      const matchesFolder = currentFolder ? snap.pageId === currentFolder : true;
      const matchesSearch =
        searchQuery === "" ||
        snap.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snap.pageName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snap.meta.filters.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [snapshots, currentFolder, searchQuery]);

  const handleDownload = (snap: Snapshot) => {
    // Download the real captured photo when one exists -- only fall back to
    // a metadata JSON export for snapshots that never had an image.
    const downloadAnchor = document.createElement("a");
    if (snap.image) {
      downloadAnchor.setAttribute("href", snap.image);
      downloadAnchor.setAttribute("download", snap.filename);
    } else {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snap, null, 2));
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", snap.filename.replace(/\.(png|jpe?g)$/i, ".json"));
    }
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* HEADER CARD */}
      <div className="bg-[#C7E3FA] rounded-3xl p-6 border border-[#9EC8EF] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-extrabold text-[#1F3557] tracking-tight uppercase flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#315C9F]" />
              Snapshot Archives
            </h2>
            <p className="text-xs text-[#5E7393] font-sans font-semibold mt-1">
              Virtual vault of active page states, operational counts, and automated AI backups
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentFolder && (
              <button
                onClick={() => setCurrentFolder(null)}
                className="px-3.5 py-1.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-[10.5px] uppercase transition-colors cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Root Folder
              </button>
            )}
            <div className="bg-[#EAF5FF] rounded-xl border border-[#9EC8EF] p-0.5 flex">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === "grid" ? "bg-[#315C9F] text-white" : "text-[#5E7393] hover:text-[#1F3557]"
                }`}
                title="Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === "list" ? "bg-[#315C9F] text-white" : "text-[#5E7393] hover:text-[#1F3557]"
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#C7E3FA]/60 p-4.5 rounded-[22px] border border-[#9EC8EF]/60 shadow-sm">
          <p className="text-[10px] font-black uppercase text-[#5E7393] tracking-wider">Total Snaps</p>
          <p className="text-xl font-black text-[#1F3557] font-mono mt-1">{snapshots.length}</p>
          <span className="text-[9px] text-[#22C55E] font-bold">100% cloud stored</span>
        </div>
        <div className="bg-[#C7E3FA]/60 p-4.5 rounded-[22px] border border-[#9EC8EF]/60 shadow-sm">
          <p className="text-[10px] font-black uppercase text-[#5E7393] tracking-wider">Folders Map</p>
          <p className="text-xl font-black text-[#1F3557] font-mono mt-1">3 Directories</p>
          <span className="text-[9px] text-[#5E7393] font-bold">Dashboard, Customers, Leads</span>
        </div>
        <div className="bg-[#C7E3FA]/60 p-4.5 rounded-[22px] border border-[#9EC8EF]/60 shadow-sm">
          <p className="text-[10px] font-black uppercase text-[#5E7393] tracking-wider">Archives Size</p>
          <p className="text-xl font-black text-[#1F3557] font-mono mt-1">
            {(snapshots.length * 480).toLocaleString()} KB
          </p>
          <span className="text-[9px] text-[#5E7393] font-bold">Approx. 480KB per snap</span>
        </div>
        <div className="bg-[#C7E3FA]/60 p-4.5 rounded-[22px] border border-[#9EC8EF]/60 shadow-sm">
          <p className="text-[10px] font-black uppercase text-[#5E7393] tracking-wider">Backup Status</p>
          <p className="text-xl font-black text-[#22C55E] font-display mt-1 uppercase tracking-tight">Active</p>
          <span className="text-[9px] text-[#5E7393] font-bold">Automatic local index synced</span>
        </div>
      </div>

      {/* FOLDER EXPLORER CONTAINER */}
      <div className="bg-[#C7E3FA] p-5 rounded-[28px] border border-[#9EC8EF] shadow-sm space-y-5">
        {/* Navigation Breadcrumb & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#9EC8EF]/50 pb-4">
          <div className="flex items-center gap-1.5 text-xs text-[#1F3557] font-bold font-mono">
            <span>/System/Snapshots</span>
            {currentFolder && (
              <>
                <span className="text-[#5E7393]">/</span>
                <span className="bg-[#315C9F]/10 px-2 py-0.5 rounded text-[#315C9F]">
                  {currentFolder.toUpperCase()}
                </span>
              </>
            )}
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5E7393]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search file snapshots..."
              className="w-full text-xs bg-[#EAF5FF] border border-[#9EC8EF] rounded-xl pl-8.5 pr-3 py-2 focus:outline-none focus:border-[#4A86F7] font-medium font-sans text-[#1F3557]"
            />
          </div>
        </div>

        {/* 1. DIRECTORY LIST (Show when at Root and no search is active) */}
        {!currentFolder && searchQuery === "" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => setCurrentFolder(folder.id)}
                className="bg-[#EAF5FF] hover:bg-[#D5EAFD] border border-[#9EC8EF] p-5 rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#C7E3FA] text-[#315C9F] flex items-center justify-center">
                    <Folder className="w-6 h-6 fill-[#315C9F]/20 text-[#315C9F]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-[#1F3557] uppercase tracking-wider">{folder.name} Folder</h3>
                    <p className="text-[10px] text-[#5E7393] font-semibold mt-0.5">
                      {folder.count} snapshot{folder.count !== 1 && "s"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[#5E7393] font-bold">➔</span>
              </div>
            ))}
          </div>
        )}

        {/* 2. FILE SNAPSHOTS (GRID OR LIST) */}
        {filteredSnapshots.length === 0 ? (
          <div className="bg-[#EAF5FF] p-12 rounded-2xl border border-dashed border-[#9EC8EF] text-center flex flex-col items-center justify-center">
            <Folder className="w-10 h-10 text-[#9EC8EF] mb-3 fill-blue-50/50" />
            <h4 className="text-xs font-black text-[#1F3557] uppercase tracking-wider">Empty Directory Node</h4>
            <p className="text-[11px] text-[#5E7393] mt-1 max-w-xs font-medium">
              No page snapshots found in this partition. Click the "Snapshot" camera button on any active screen to record state.
            </p>
          </div>
        ) : (
          <div>
            {/* If inside folder, header */}
            {currentFolder && (
              <h3 className="text-[10px] font-black text-[#5E7393] uppercase tracking-wider mb-3">
                File Index ({filteredSnapshots.length} files)
              </h3>
            )}

            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    onClick={() => setSelectedSnapshot(snap)}
                    className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl p-4 flex flex-col justify-between h-[180px] transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer text-left relative group overflow-hidden"
                  >
                    {/* Top block */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="p-1 rounded-lg bg-[#315C9F]/10 text-[#315C9F]">
                          <FileText className="w-4 h-4 text-current" />
                        </span>
                        <span className="text-[8.5px] font-mono font-bold text-[#5E7393] bg-[#C7E3FA]/60 px-1.5 py-0.5 rounded">
                          {snap.fileSize}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black text-[#1F3557] font-mono break-all leading-tight">
                          {snap.filename}
                        </h4>
                        <span className="text-[9px] text-[#315C9F] font-bold uppercase tracking-wider mt-1 block">
                          Source: {snap.pageName}
                        </span>
                      </div>
                    </div>

                    {/* Meta snapshot tags */}
                    <div className="border-t border-b border-[#9EC8EF]/30 py-1 text-[9px] text-[#5E7393] font-sans font-semibold space-y-0.5">
                      <p>• Data volume: <strong className="text-[#1F3557]">{snap.meta.recordCount} entries</strong></p>
                      <p className="truncate">• Filter State: <strong className="text-[#1F3557]">{snap.meta.filters}</strong></p>
                    </div>

                    {/* Bottom block actions */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[9px] font-mono font-semibold text-[#5E7393]">
                        {snap.timestamp}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(snap);
                          }}
                          className="p-1 bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-lg text-[#1F3557] border border-[#9EC8EF]/50"
                          title="Download Meta"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSnapshot(snap.id);
                          }}
                          className="p-1 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 border border-red-200"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* LIST VIEW */
              <div className="border border-[#9EC8EF] rounded-2xl overflow-hidden divide-y divide-[#9EC8EF]">
                {filteredSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    onClick={() => setSelectedSnapshot(snap)}
                    className="bg-[#EAF5FF] hover:bg-[#D5EAFD] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-[#C7E3FA] text-[#315C9F] shrink-0">
                        <FileText className="w-4 h-4 text-current" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[11.5px] font-black text-[#1F3557] font-mono truncate max-w-md">
                          {snap.filename}
                        </h4>
                        <div className="flex flex-wrap gap-2 text-[9px] text-[#5E7393] font-semibold mt-0.5">
                          <span>{snap.pageName}</span>
                          <span>•</span>
                          <span>{snap.timestamp}</span>
                          <span>•</span>
                          <span className="font-mono text-[#1F3557]">{snap.fileSize}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <span className="text-[9.5px] font-mono text-[#5E7393] bg-[#C7E3FA]/40 px-2 py-0.5 rounded border border-[#9EC8EF]/30">
                        {snap.meta.recordCount} rows • {snap.meta.filters}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(snap);
                          }}
                          className="p-1.5 bg-[#C7E3FA] hover:bg-[#BDDDF8] rounded-xl text-[#1F3557] border border-[#9EC8EF]/60"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSnapshot(snap.id);
                          }}
                          className="p-1.5 bg-red-50 hover:bg-red-100 rounded-xl text-red-600 border border-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* LIGHTBOX PROPERTIES DIALOG MODAL */}
      {selectedSnapshot && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#C7E3FA] text-[#1F3557] rounded-[28px] p-6 w-[95%] max-w-[540px] shadow-2xl border border-[#9EC8EF] text-left animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#9EC8EF] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-[#315C9F]" />
                <h3 className="text-sm font-black text-[#1F3557] uppercase tracking-wider">Snapshot Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedSnapshot(null)}
                className="text-xs text-[#5E7393] hover:text-[#1F3557] font-bold bg-[#EAF5FF] border border-[#9EC8EF] p-1.5 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 font-sans text-xs">
              {/* Properties Box */}
              <div className="bg-[#EAF5FF] p-4.5 rounded-2xl border border-[#9EC8EF] space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <span className="text-[#5E7393] font-bold">File Name:</span>
                  <span className="col-span-2 font-mono font-bold text-[#1F3557] break-all">{selectedSnapshot.filename}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <span className="text-[#5E7393] font-bold">Source Directory:</span>
                  <span className="col-span-2 text-[#1F3557] font-bold uppercase tracking-wider">{selectedSnapshot.pageName}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <span className="text-[#5E7393] font-bold">Captured Date:</span>
                  <span className="col-span-2 text-[#1F3557] font-bold font-mono">{selectedSnapshot.timestamp}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <span className="text-[#5E7393] font-bold">Data Elements:</span>
                  <span className="col-span-2 text-[#1F3557] font-semibold">{selectedSnapshot.meta.recordCount} items logged</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <span className="text-[#5E7393] font-bold">Active Filters:</span>
                  <span className="col-span-2 text-[#1F3557] font-bold">{selectedSnapshot.meta.filters}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <span className="text-[#5E7393] font-bold">Archive Type:</span>
                  <span className="col-span-2 text-[#1F3557] font-semibold">Portable State Object (.json)</span>
                </div>
              </div>

              {/* Dynamic Simulated UI Layout Snapshot Panel */}
              <div className="border border-[#9EC8EF] rounded-2xl overflow-hidden bg-[#EAF5FF]">
                <div className="bg-[#315C9F] text-white px-3 py-1.5 flex items-center justify-between text-[8px] font-bold uppercase tracking-wider font-mono">
                  <span>📷 {selectedSnapshot.image ? "Live Camera Photo" : "Simulated Screen Capture"}</span>
                  <span>{selectedSnapshot.fileSize}</span>
                </div>
                <div className="p-5 flex flex-col gap-4 text-[#1F3557] min-h-[160px] justify-between relative bg-[#EAF5FF]">
                  {selectedSnapshot.image ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <img
                        src={selectedSnapshot.image}
                        alt="Captured site snapshot"
                        className="rounded-xl max-h-48 w-full object-cover border border-[#9EC8EF]"
                        referrerPolicy="no-referrer"
                      />
                      <p className="text-[9px] text-[#5E7393] font-sans font-semibold">Captured Live via Device Camera</p>
                    </div>
                  ) : (
                    /* Mock UI Representation */
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-2 border-b border-blue-200/50">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-[#315C9F]">{selectedSnapshot.pageName}</p>
                          <p className="text-[8px] text-[#5E7393]">OwnersLOCAL Terminal Session</p>
                        </div>
                        <span className="text-[8px] font-mono px-1 bg-emerald-100 text-emerald-800 rounded font-bold">VERIFIED STATE</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="p-2 bg-[#C7E3FA]/40 rounded-xl border border-blue-200/40 text-center">
                          <p className="text-[7.5px] uppercase font-bold text-[#5E7393]">Records</p>
                          <p className="text-sm font-black text-[#1F3557] font-mono mt-0.5">{selectedSnapshot.meta.recordCount}</p>
                        </div>
                        <div className="p-2 bg-[#C7E3FA]/40 rounded-xl border border-blue-200/40 text-center">
                          <p className="text-[7.5px] uppercase font-bold text-[#5E7393]">Active Filter</p>
                          <p className="text-[9px] font-black text-[#1F3557] mt-0.5 truncate">{selectedSnapshot.meta.filters}</p>
                        </div>
                        <div className="p-2 bg-[#C7E3FA]/40 rounded-xl border border-blue-200/40 text-center">
                          <p className="text-[7.5px] uppercase font-bold text-[#5E7393]">Checksum</p>
                          <p className="text-[8px] font-mono font-bold text-[#315C9F] mt-1">#LF{selectedSnapshot.id.toUpperCase()}</p>
                        </div>
                      </div>

                      <div className="p-2.5 bg-[#C7E3FA]/20 rounded-xl border border-dashed border-blue-200 text-[8px] text-[#5E7393] font-semibold leading-relaxed">
                        Captured session metrics: {selectedSnapshot.meta.details}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    const customContext = `Historical Page State captured on ${selectedSnapshot.timestamp}. Page: ${selectedSnapshot.pageName}, Active filters: ${selectedSnapshot.meta.filters}, Total recorded data elements: ${selectedSnapshot.meta.recordCount}. Metrics detail context: ${selectedSnapshot.meta.details}`;
                    onOpenAIAnalysis(selectedSnapshot.pageId, selectedSnapshot.pageName, customContext);
                    setSelectedSnapshot(null);
                  }}
                  className="flex-1 py-2.5 bg-[#4A86F7] hover:bg-[#3977EE] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300/20" />
                  Ask AI to Diagnose State
                </button>
                <button
                  onClick={() => handleDownload(selectedSnapshot)}
                  className="px-4 py-2.5 bg-[#EAF5FF] hover:bg-[#BDDDF8] border border-[#9EC8EF] text-[#1F3557] font-bold rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
