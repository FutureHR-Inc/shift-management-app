import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  // アイコン（SVGパス文字列）
  icon?: React.ReactNode;
  // タイトル
  title: string;
  // 説明文
  description?: string;
  // アクションボタン
  actionLabel?: string;
  onAction?: () => void;
  // 追加のクラス名
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  // デフォルトアイコン（空の四角形）
  const defaultIcon = (
    <svg 
      className="w-16 h-16 text-gray-300" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={1} 
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
      />
    </svg>
  );

  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center ${className}`}>
      {/* アイコン */}
      <div className="mb-6">
        {icon || defaultIcon}
      </div>

      {/* タイトル */}
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        {title}
      </h3>

      {/* 説明文 */}
      {description && (
        <p className="text-gray-600 mb-6 max-w-md">
          {description}
        </p>
      )}

      {/* アクションボタン */}
      {actionLabel && onAction && (
        <Button onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

// 特定用途向けのプリセット空状態コンポーネント

// スタッフ未登録状態
export const EmptyStaff: React.FC<{ onAddStaff?: () => void }> = ({ onAddStaff }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    }
    title="スタッフが登録されていません"
    description="まずはスタッフを登録してシフト管理を始めましょう。"
    actionLabel="スタッフを追加"
    onAction={onAddStaff}
  />
);

// シフト未作成状態
export const EmptyShifts: React.FC<{ onCreateShift?: () => void }> = ({ onCreateShift }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    }
    title="シフトが作成されていません"
    description="この週のシフトを作成して、スタッフの勤務予定を管理しましょう。"
    actionLabel="シフトを作成"
    onAction={onCreateShift}
  />
);

// 希望休申請がない状態
export const EmptyTimeOffRequests: React.FC = () => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    }
    title="希望休申請はありません"
    description="現在、承認待ちの希望休申請はありません。"
  />
);

// 代打募集がない状態
export const EmptyEmergencyRequests: React.FC<{ onCreateRequest?: () => void }> = ({ onCreateRequest }) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    }
    title="代打募集はありません"
    description="現在、募集中の代打要請はありません。"
    actionLabel="代打を募集"
    onAction={onCreateRequest}
  />
);

// 検索結果なし状態
export const EmptySearchResults: React.FC<{ searchTerm?: string; onClearSearch?: () => void }> = ({ 
  searchTerm, 
  onClearSearch 
}) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    }
    title="検索結果が見つかりません"
    description={searchTerm ? `「${searchTerm}」に一致する結果はありませんでした。` : '条件に一致する結果はありませんでした。'}
    actionLabel={onClearSearch ? "検索をクリア" : undefined}
    onAction={onClearSearch}
  />
);

// ローディング状態
export const LoadingState: React.FC<{ message?: string }> = ({ message = "読み込み中..." }) => (
  <div className="flex flex-col items-center justify-center p-12 text-center">
    <div className="mb-4">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
    </div>
    <p className="text-gray-600">{message}</p>
  </div>
);

// エラー状態
export const ErrorState: React.FC<{ 
  message?: string; 
  onRetry?: () => void;
}> = ({ 
  message = "エラーが発生しました", 
  onRetry 
}) => (
  <EmptyState
    icon={
      <svg className="w-16 h-16 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    }
    title="エラーが発生しました"
    description={message}
    actionLabel={onRetry ? "再試行" : undefined}
    onAction={onRetry}
  />
); 