'use client'

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import StudioLayout from '@/components/StudioLayout';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 设置全局 document.title
  useEffect(() => {
    document.title = 'OnlyOffice MVP';
  }, []);

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <StudioLayout>{children}</StudioLayout>
      </body>
    </html>
  );
}
