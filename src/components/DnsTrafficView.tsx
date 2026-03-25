import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, Server, ArrowRight, ArrowLeft } from 'lucide-react';

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
  };
}

export function DnsTrafficView() {
  const [packets, setPackets] = useState<DnsPacket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPackets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const passcode = localStorage.getItem('gtd-passcode');
      const headers: Record<string, string> = {};
      if (passcode) {
        headers['Authorization'] = `Bearer ${passcode}`;
      }
      const response = await fetch('/api/dns-traffic', { headers });
      if (!response.ok) throw new Error('Failed to fetch DNS traffic');
      const data = await response.json();
      setPackets(data.packets || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPackets();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="text-indigo-500" size={24} />
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">
            DNS Traffic Analysis
          </h2>
        </div>
        <button
          onClick={fetchPackets}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-8">
        {error && (
          <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg">
            {error}
          </div>
        )}

        {packets.length === 0 && !isLoading && !error ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <Server size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">No DNS packets found</p>
            <p className="text-sm mt-2">Upload a gzipped PCAP file to /ingest/pcap to see traffic.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Dest</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Query</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {packets.map((pkt, idx) => {
                    const isQuery = pkt.dns.type === 'query';
                    const queryName = pkt.dns.questions?.[0]?.name || 'N/A';
                    const queryType = pkt.dns.questions?.[0]?.type || 'N/A';
                    const answers = pkt.dns.answers?.map(a => a.data).join(', ') || '';

                    return (
                      <tr key={idx} className="hover:bg-zinc-800/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                          {new Date(pkt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                          {pkt.srcIp}:{pkt.srcPort}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                          {pkt.dstIp}:{pkt.dstPort}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${isQuery ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {isQuery ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                            {isQuery ? 'Query' : 'Response'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-zinc-200">
                          {queryName} <span className="text-zinc-500 text-xs">({queryType})</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 truncate max-w-xs" title={answers || pkt.dns.rcode}>
                          {isQuery ? '-' : (answers || `RCODE: ${pkt.dns.rcode}`)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
