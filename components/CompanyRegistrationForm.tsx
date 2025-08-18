'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface CompanyRegistrationProps {
  currentUser: any;
  onSuccess: (updatedUser: any) => void;
}

export default function CompanyRegistrationForm({ currentUser, onSuccess }: CompanyRegistrationProps) {
  const [formData, setFormData] = useState({
    companyName: '',
    description: '',
    address: '',
    phoneNumber: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // バリデーション
      if (!formData.companyName.trim()) {
        throw new Error('企業名は必須です');
      }

      // 🔧 修正: 不要な事前チェックを削除（APIサイドで適切に処理される）
      // 既存の company_id がある場合は API側で 409 エラーを返すため、フロントエンド側での事前チェックは不要

      // 企業登録API呼び出し
      const response = await fetch('/api/companies/register-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName: formData.companyName,
          description: formData.description,
          address: formData.address,
          phoneNumber: formData.phoneNumber,
          managerId: currentUser?.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '企業登録に失敗しました');
      }

      const result = await response.json();

      // ローカルストレージのユーザー情報を更新
      const updatedUser = {
        ...currentUser,
        company_id: result.company.id
      };
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));

      // 成功メッセージ
      alert(`企業「${result.company.name}」の登録が完了しました！\nスタッフ管理画面で従業員を追加できます。`);

      // 成功コールバック（更新されたユーザー情報を渡す）
      onSuccess(updatedUser);

      // フォームをリセット
      setFormData({
        companyName: '',
        description: '',
        address: '',
        phoneNumber: ''
      });

    } catch (error) {
      console.error('Company registration error:', error);
      setError(error instanceof Error ? error.message : '企業登録に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold text-center">🏢 企業情報登録</CardTitle>
        <p className="text-gray-600 text-center text-sm">
          新しい企業をシステムに登録して、スタッフ管理を開始しましょう
        </p>

        {/* 進行状況インジケーター */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">企業情報登録中</h3>
              <p className="text-sm text-blue-700">
                こちらのフォームで企業情報を入力してください。登録完了後、スタッフ管理が可能になります。
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              企業名 <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={formData.companyName}
              onChange={(e) => handleInputChange('companyName', e.target.value)}
              placeholder="例: 株式会社サンプル"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              企業説明
            </label>
            <Input
              type="text"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="例: 飲食店チェーン運営"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              住所
            </label>
            <Input
              type="text"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="例: 東京都渋谷区..."
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              代表電話番号
            </label>
            <Input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              placeholder="例: 03-1234-5678"
              disabled={isSubmitting}
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">💡 登録後にできること</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• スタッフアカウントの追加・管理</li>
              <li>• 店舗の設定・管理</li>
              <li>• シフト作成・管理</li>
              <li>• 企業専用の管理画面</li>
            </ul>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? '登録中...' : '🏢 企業を登録'}
          </Button>
        </form>

        <div className="mt-4 text-xs text-gray-500 text-center">
          登録後、あなたが最初の管理者として設定されます
        </div>
      </CardContent>
    </Card>
  );
}
