'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function EmergencyManagementPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'manage'>('browse');

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">代打募集管理</h1>
          <p className="text-gray-600 mt-2">代打募集の作成・管理を行えます</p>
        </div>

        {/* タブナビゲーション */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('browse')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'browse'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              募集一覧
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'create'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              募集作成
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'manage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              募集管理
            </button>
          </nav>
        </div>

        {/* タブコンテンツ */}
        {activeTab === 'create' && (
          <div className="space-y-6">
            {/* 代打募集作成 */}
            <Card>
              <CardHeader>
                <CardTitle>代打募集の作成</CardTitle>
                <p className="text-sm text-gray-600">代打募集を作成するには、シフト作成画面から代打を募集したいスタッフ枠を選択して、代打募集をしてください</p>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="font-medium text-blue-800 mb-1">代打募集の手順:</p>
                      <ol className="text-blue-700 space-y-1">
                        <li>1. シフト作成画面に移動</li>
                        <li>2. 既存のスタッフ枠をクリック</li>
                        <li>3. 「代打を募集」を選択</li>
                        <li>4. 募集理由を入力して作成完了</li>
                      </ol>
                </div>
                  </div>
                  </div>
                <Button
                  onClick={() => router.push('/shift/create')}
                  className="w-full justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  シフト作成画面に移動
                </Button>
              </CardContent>
            </Card>

            {/* 注意事項 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">代打募集に関する注意事項</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>• 代打募集の作成後は内容の変更ができません</li>
                  <li>• 複数の応募者がいる場合、最終的な選考を行ってください</li>
                  <li>• 応募があった場合はメールで通知されます</li>
                  <li>• 代打が決定したら速やかに確定処理を行ってください</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
} 