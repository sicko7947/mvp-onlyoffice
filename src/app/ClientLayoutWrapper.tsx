'use client'

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import StudioLayout from '@/components/StudioLayout';

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isServicePage = pathname === '/onlyoffice-service';

  // 设置全局 document.title
  useEffect(() => {
    if (!isServicePage) {
      document.title = 'OnlyOffice MVP';
    }
  }, [isServicePage]);

  // 设置服务页面的 body 样式
  useEffect(() => {
    if (isServicePage) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      // 重置样式
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.body.style.overflow = '';
    }
  }, [isServicePage]);

  // 服务页面不使用 StudioLayout
  if (isServicePage) {
    return <>{children}</>;
  }

  return <StudioLayout>{children}</StudioLayout>;
}
