import React, { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, Server, ArrowRight, ArrowLeft, Terminal, Search, Trash2, Filter, ArrowUpDown, Wifi, WifiOff, Download } from 'lucide-react';

interface DnsPacket {
  timestamp: number;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  dns: {
    id: number;
    type: 'query' | 'response';
    flags: number;
    flag_qr: boolean;
    opcode: string;
    rcode: string;
    questions: Array<{ name: string; type: string; class: string }>;
    answers: Array<{ name: string; type: string; class: string; ttl: number; data: any }>;
    authorities: Array<any>;
    additionals: Array<any>;
    _truncated?: boolean;
    _error?: string;
  };
}

export function DnsTrafficView() {
  const [packets, setPackets] = useState<DnsPacket[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'query' | 'response' | 'truncated'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: 'timestamp' | 'name'; direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const passcode = localStorage.getItem('gtd-passcode');
    const sseUrl = `/api/dns-stream${passcode ? `?passcode=${encodeURIComponent(passcode)}` : ''}`;
    console.log('[SSE] Connecting to:', sseUrl.split('?')[0]); // Log without passcode
    
    const eventSource = new EventSource(sseUrl);
    let connectionTimeout: NodeJS.Timeout;

    eventSource.onopen = () => {
      console.log('[SSE] Connected');
      setIsConnected(true);
      clearTimeout(connectionTimeout);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          console.log('[SSE] Received connection confirmation');
          setIsConnected(true);
          clearTimeout(connectionTimeout);
        } else if (data.type === 'packet') {
          setPackets(prev => [data.packet, ...prev].slice(0, 2000));
        } else if (data.type === 'log') {
          setLogs(prev => [data.log, ...prev].slice(0, 500));
        }
      } catch (e) {
        console.error('Failed to parse SSE message', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      setIsConnected(false);
      clearTimeout(connectionTimeout);
      
      // EventSource auto-reconnects by default, but if it's completely closed (readyState 2),
      // we might need to handle it. Usually, we just let the browser handle it.
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[SSE] Connection closed permanently by server');
      }
    };

    // Timeout if connection hangs (e.g., due to proxy buffering)
    connectionTimeout = setTimeout(() => {
      if (eventSource.readyState === EventSource.CONNECTING) {
        console.warn('[SSE] Connection timed out (hanging in CONNECTING state). Check proxy buffering.');
        eventSource.close();
        setIsConnected(false);
      }
    }, 10000);

    return () => {
      console.log('[SSE] Closing connection');
      clearTimeout(connectionTimeout);
      eventSource.close();
    };
  }, []);

  const filteredAndSortedPackets = useMemo(() => {
    let result = [...packets];

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.srcIp.toLowerCase().includes(lowerSearch) ||
        p.dstIp.toLowerCase().includes(lowerSearch) ||
        p.dns.questions?.[0]?.name?.toLowerCase().includes(lowerSearch) ||
        p.dns.answers?.some(a => String(a.data).toLowerCase().includes(lowerSearch))
      );
    }

    if (filterType !== 'all') {
      result = result.filter(p => {
        const isTruncated = p.dns._truncated;
        if (filterType === 'truncated') return isTruncated;
        if (filterType === 'query') return p.dns.type === 'query' && !isTruncated;
        if (filterType === 'response') return p.dns.type === 'response' && !isTruncated;
        return true;
      });
    }

    result.sort((a, b) => {
      if (sortConfig.key === 'timestamp') {
        return sortConfig.direction === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
      } else if (sortConfig.key === 'name') {
        const nameA = a.dns.questions?.[0]?.name || '';
        const nameB = b.dns.questions?.[0]?.name || '';
        return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      return 0;
    });

    return result;
  }, [packets, searchTerm, filterType, sortConfig]);

  const toggleSort = (key: 'timestamp' | 'name') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const clearTraffic = () => {
    setPackets([]);
    setLogs([]);
  };

  const downloadTraffic = () => {
    if (packets.length === 0) return;
    const dataStr = JSON.stringify(filteredAndSortedPackets, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dns-traffic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-indigo-500" size={24} />
            <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">
              DNS Traffic Analysis
            </h2>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isConnected ? 'Live' : 'Offline'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadTraffic}
              disabled={packets.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
            >
              <Download size={16} />
              Download
            </button>
            <button
              onClick={clearTraffic}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Search by IP, domain, or data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-1">
              {(['all', 'query', 'response', 'truncated'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 rounded text-xs font-medium capitalize transition-all ${filterType === type ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-8">
        {packets.length === 0 ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
              <Server size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">No DNS packets captured yet</p>
              <p className="text-sm mt-2 text-zinc-600">Upload a PCAP file to see live streaming traffic.</p>
            </div>
            
            {logs.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
                  <Terminal size={16} className="text-zinc-400" />
                  <h3 className="text-sm font-medium text-zinc-300">Parser Logs</h3>
                </div>
                <div className="p-4 font-mono text-xs text-zinc-400 h-64 overflow-y-auto space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className="break-all">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50 border-b border-zinc-800">
                    <tr>
                      <th 
                        className="px-4 py-3 font-medium cursor-pointer hover:text-zinc-300 transition-colors"
                        onClick={() => toggleSort('timestamp')}
                      >
                        <div className="flex items-center gap-1">
                          Time {sortConfig.key === 'timestamp' && <ArrowUpDown size={12} className="text-indigo-500" />}
                        </div>
                      </th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Dest</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th 
                        className="px-4 py-3 font-medium cursor-pointer hover:text-zinc-300 transition-colors"
                        onClick={() => toggleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          Query {sortConfig.key === 'name' && <ArrowUpDown size={12} className="text-indigo-500" />}
                        </div>
                      </th>
                      <th className="px-4 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filteredAndSortedPackets.map((pkt, idx) => {
                      const isQuery = pkt.dns.type === 'query';
                      const queryName = pkt.dns.questions?.[0]?.name || 'N/A';
                      const queryType = pkt.dns.questions?.[0]?.type || 'N/A';
                      const answers = pkt.dns.answers?.map(a => a.data).join(', ') || '';
                      const isTruncated = pkt.dns._truncated;
                      const errorMessage = pkt.dns._error;

                      return (
                        <tr key={`${pkt.timestamp}-${idx}`} className="hover:bg-zinc-800/50 transition-colors group">
                          <td className="px-4 py-3 whitespace-nowrap text-zinc-400 font-mono text-[10px]">
                            {new Date(pkt.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            <span className="text-zinc-600 ml-1">.{String(pkt.timestamp % 1000).padStart(3, '0')}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                            <span className="text-zinc-500">{pkt.srcIp}</span>
                            <span className="text-zinc-600">:{pkt.srcPort}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                            <span className="text-zinc-500">{pkt.dstIp}</span>
                            <span className="text-zinc-600">:{pkt.dstPort}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isTruncated ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                Truncated
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${isQuery ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                {isQuery ? <ArrowRight size={10} /> : <ArrowLeft size={10} />}
                                {isQuery ? 'Query' : 'Response'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-zinc-200">
                            {isTruncated ? (
                              <span className="text-amber-500/70 text-xs italic">Decode Failed</span>
                            ) : (
                              <div className="flex flex-col">
                                <span className="text-sm truncate max-w-[200px]" title={queryName}>{queryName}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{queryType}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-xs" title={isTruncated ? errorMessage : (answers || pkt.dns.rcode)}>
                            {isTruncated ? (
                              <span className="text-rose-500/70">{errorMessage}</span>
                            ) : (
                              isQuery ? (
                                <span className="text-zinc-600 italic">Pending...</span>
                              ) : (
                                <span className="text-zinc-300">{answers || `RCODE: ${pkt.dns.rcode}`}</span>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {logs.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
                  <Terminal size={16} className="text-zinc-400" />
                  <h3 className="text-sm font-medium text-zinc-300">Parser Logs</h3>
                </div>
                <div className="p-4 font-mono text-xs text-zinc-400 h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-800">
                  {logs.map((log, i) => (
                    <div key={i} className="break-all border-l border-zinc-800 pl-2 py-0.5">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
