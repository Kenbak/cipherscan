'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HashLink } from '@/components/ui/HashLink';
import { AddressDisplay } from '@/components/AddressWithLabel';
import { CURRENCY } from '@/lib/config';
import { formatTimestamp } from './helpers';
import { Icons } from './icons';
import { TransactionPagination } from './TransactionPagination';
import type { AddressData, Transaction } from './types';

interface TransactionTableProps {
  address: string;
  data: AddressData;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalTxCount: number;
}

export function TransactionTable({
  address,
  data,
  currentPage,
  totalPages,
  pageSize,
  totalTxCount,
}: TransactionTableProps) {
  const router = useRouter();
  const sortedTxs = [...data.transactions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="animate-fade-in-up stagger-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted tracking-wider">&gt; TRANSACTIONS</span>
            <Badge color="cyan">{totalTxCount}</Badge>
          </div>
          <span className="text-sm text-muted font-normal font-mono ml-auto">
            {totalPages > 1 ? `page ${currentPage} of ${totalPages}` : `${totalTxCount} total`}
          </span>
        </CardHeader>
        <CardBody>

          {data.transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-secondary">No transactions found for this address</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-6 px-6">
                {/* Table Header */}
                <div className="min-w-[800px] grid grid-cols-12 gap-3 px-4 py-2 mb-2 text-xs font-semibold text-muted uppercase tracking-wider border-b block-info-border">
                  <div className="col-span-1">Type</div>
                  <div className="col-span-3">Transaction Hash</div>
                  <div className="col-span-1">Block</div>
                  <div className="col-span-2">Age</div>
                  <div className="col-span-3">From → To</div>
                  <div className="col-span-2 text-right">Amount ({CURRENCY})</div>
                </div>

                {/* Transaction Rows */}
                <div className="space-y-2 min-w-[800px]">
                  {sortedTxs.map((tx, index) => (
                    <div key={tx.txid || index} onClick={() => router.push(`/tx/${tx.txid}`)} className="grid grid-cols-12 gap-3 items-center block-tx-row p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan transition cursor-pointer group">
                      {/* Type Column */}
                      <div className="col-span-1">
                        {tx.type === 'received' ? (
                          <Badge color="green" icon={<Icons.ArrowDown />}>IN</Badge>
                        ) : (
                          <Badge color="orange" icon={<Icons.ArrowUp />}>OUT</Badge>
                        )}
                      </div>

                      {/* Hash Column */}
                      <div className="col-span-3">
                        <HashLink value={tx.txid} href={`/tx/${tx.txid}`} lead={10} tail={6} linkClassName="text-xs text-secondary group-hover:text-primary transition-colors font-mono" />
                      </div>

                      {/* Block Column */}
                      <div className="col-span-1">
                        {tx.blockHeight ? (
                          <Link
                            href={`/block/${tx.blockHeight}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-cipher-cyan hover:underline"
                          >
                            #{tx.blockHeight}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted">-</span>
                        )}
                      </div>

                      {/* Age Column */}
                      <div className="col-span-2">
                        <span className="text-xs text-secondary">
                          {formatTimestamp(tx.timestamp)}
                        </span>
                      </div>

                      {/* From → To Column */}
                      <div className="col-span-3">
                        <div className="flex items-center gap-1 text-xs text-secondary font-mono">
                          {tx.isDeshielding ? (
                            <>
                              <span className="text-cipher-purple flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Shielded
                              </span>
                              <span className="text-muted">→</span>
                              <AddressDisplay address={address} className="text-xs truncate" />
                            </>
                          ) : tx.isShielding ? (
                            <>
                              <AddressDisplay address={address} className="text-xs truncate" />
                              <span className="text-muted">→</span>
                              <span className="text-cipher-purple flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Shielded
                              </span>
                            </>
                          ) : tx.isShielded ? (
                            <>
                              <span className="px-1.5 py-0.5 bg-cipher-purple/10 text-cipher-purple text-[10px] rounded font-mono flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                SHIELDED
                              </span>
                              <span className="text-muted text-[10px]">Private Transaction</span>
                            </>
                          ) : tx.isCoinbase ? (
                            <>
                              <span className="text-muted italic">Block Reward</span>
                              <span className="text-muted">→</span>
                              <AddressDisplay address={tx.to || address} className="text-xs truncate" />
                            </>
                          ) : (
                            <>
                              {tx.from === 'shielded' ? (
                                <span className="text-cipher-purple flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                  </svg>
                                  Shielded
                                </span>
                              ) : tx.from ? (
                                <AddressDisplay address={tx.from} className="text-xs truncate" />
                              ) : (
                                <span className="text-muted">-</span>
                              )}

                              <span className="text-muted">→</span>

                              {tx.to === 'shielded' ? (
                                <span className="text-cipher-purple flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                  </svg>
                                  Shielded
                                </span>
                              ) : tx.to ? (
                                <AddressDisplay address={tx.to} className="text-xs truncate" />
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Amount Column */}
                      <div className="col-span-2 text-right">
                        {(tx.isShielded && !tx.isDeshielding && !tx.isShielding) || tx.amount === 0 ? (
                          <span className="text-xs text-cipher-purple font-mono flex items-center justify-end gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Hidden
                          </span>
                        ) : (
                          <span className={`text-sm font-mono font-semibold ${
                            tx.type === 'received' ? 'text-cipher-green' : 'text-danger'
                          }`}>
                            {tx.type === 'received' ? '+' : '-'}{Math.abs(tx.amount).toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <TransactionPagination
                address={address}
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalTxCount={totalTxCount}
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
