import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"JobPilot",description:"本地、可解释的求职匹配与投递助手"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
