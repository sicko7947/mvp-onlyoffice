#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minify: terserMinify } = require('terser');
const postcss = require('postcss');
const cssnano = require('cssnano');
const { minify: htmlMinify } = require('html-minifier-terser');

/**
 * 压缩文件夹中的文件（除了 wasm 文件）
 * @param {string} sourceDir - 源文件夹路径
 * @param {string} targetDir - 目标文件夹路径
 */
async function minifyFolder(sourceDir, targetDir) {
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 统计信息
  let totalFiles = 0;
  let compressedFiles = 0;
  let copiedFiles = 0;
  let skippedFiles = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  // 递归遍历文件夹
  async function processDirectory(currentSource, currentTarget) {
    const entries = fs.readdirSync(currentSource, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(currentSource, entry.name);
      const targetPath = path.join(currentTarget, entry.name);

      if (entry.isDirectory()) {
        // 如果是目录，递归处理
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
        await processDirectory(sourcePath, targetPath);
      } else if (entry.isFile()) {
        totalFiles++;
        

        const ext = path.extname(entry.name).toLowerCase();
        
        // 需要压缩的文件类型（压缩空格和换行符）
        const compressibleExtensions = ['.js', ".html",'.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.css'];
        
        if (compressibleExtensions.includes(ext)) {
          try {
            const relativePath = path.relative(sourceDir, sourcePath);
            console.log(`[${totalFiles}] 压缩: ${relativePath}`);
            
            const originalContent = fs.readFileSync(sourcePath, 'utf8');
            const originalSize = fs.statSync(sourcePath).size;
            totalOriginalSize += originalSize;
            
            let outputContent;
            
            // 根据文件类型使用不同的压缩工具
            if (ext === '.html') {
              // HTML: 使用 html-minifier-terser
              outputContent = await htmlMinify(originalContent, {
                removeComments: true,
                collapseWhitespace: true,
                removeAttributeQuotes: false,
                minifyCSS: false,
                minifyJS: false,
                removeEmptyAttributes: false,
                removeRedundantAttributes: false,
              });
            } else if (ext === '.css') {
              // CSS: 使用 postcss + cssnano
              const result = await postcss([cssnano]).process(originalContent, {
                from: sourcePath,
                to: targetPath,
              });
              outputContent = result.css;
            } else {
              // JS/TS/JSX/TSX: 使用 terser
              const result = await terserMinify(originalContent, {
                compress: {
                  drop_console: false,
                  drop_debugger: false,
                  pure_funcs: [],
                },
                format: {
                  comments: false,
                },
                mangle: false, // 不混淆变量名，避免破坏代码
              });
              outputContent = result.code || originalContent;
            }
            
            fs.writeFileSync(targetPath, outputContent);
            
            const compressedSize = Buffer.byteLength(outputContent);
            totalCompressedSize += compressedSize;
            compressedFiles++;
            const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
            console.log(`  ✓ 原始: ${(originalSize / 1024).toFixed(2)} KB → 压缩: ${(compressedSize / 1024).toFixed(2)} KB (减少 ${ratio}%)`);
          } catch (error) {
            console.error(`  ✗ 处理失败: ${error.message.substring(0, 100)}`);
            // 如果处理失败，直接复制原文件
            fs.copyFileSync(sourcePath, targetPath);
            const originalSize = fs.statSync(sourcePath).size;
            totalCompressedSize += originalSize;
            copiedFiles++;
            console.log(`  → 已复制原文件`);
          }
        } else {
          // 其他文件直接复制
          fs.copyFileSync(sourcePath, targetPath);
          const originalSize = fs.statSync(sourcePath).size;
          totalOriginalSize += originalSize;
          totalCompressedSize += originalSize;
          copiedFiles++;
          const relativePath = path.relative(sourceDir, sourcePath);
          if (totalFiles % 50 === 0) {
            console.log(`[${totalFiles}] 复制: ${relativePath}`);
          }
        }
      }
    }
  }

  console.log(`开始处理文件夹: ${sourceDir}`);
  console.log(`输出到: ${targetDir}\n`);
  
  await processDirectory(sourceDir, targetDir);
  
  // 输出统计信息
  console.log(`\n${'='.repeat(60)}`);
  console.log(`处理完成！统计信息:`);
  console.log(`${'='.repeat(60)}`);
  console.log(`总文件数: ${totalFiles}`);
  console.log(`压缩文件: ${compressedFiles}`);
  console.log(`复制文件: ${copiedFiles}`);
  console.log(`跳过文件: ${skippedFiles}`);
  console.log(`\n总原始大小: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`总压缩后大小: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
  if (totalOriginalSize > 0) {
    const totalRatio = ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(2);
    console.log(`总体减少: ${totalRatio}%`);
  }
  console.log(`${'='.repeat(60)}`);
}

// 从命令行参数获取路径
const args = process.argv.slice(2);
const sourceDir = args[0] || path.resolve(__dirname, '../public/packages/onlyoffice/7');
const targetDir = args[1] || path.resolve(__dirname, '../public/packages/onlyoffice/7-minify');

// 验证源目录是否存在
if (!fs.existsSync(sourceDir)) {
  console.error(`错误: 源目录不存在: ${sourceDir}`);
  process.exit(1);
}

// 运行压缩
minifyFolder(sourceDir, targetDir).catch(error => {
  console.error('处理过程中发生错误:', error);
  process.exit(1);
});
