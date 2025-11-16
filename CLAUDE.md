# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Obsidian MinIO Plus 插件，基于原始的 Obsidian Minio Uploader Plugin 进行了功能增强。该插件允许用户将文件（图片、视频、音频、文档等）上传到 MinIO 对象存储服务，并提供了图片库视图功能。

## 常用开发命令

### 构建和开发
```bash
# 开发模式（监听文件变化）
npm run dev
# 或
pnpm run dev

# 生产构建
npm run build
# 或
pnpm run build

# 类型检查
tsc -noEmit -skipLibCheck
```

### 版本管理
```bash
# 更新版本号（会自动更新 manifest.json 和 versions.json）
npm run version
# 或
pnpm run version
```

## 代码架构

### 核心组件结构

1. **主插件类** (`src/main.ts`)
   - `MinioPlusPlugin`: 插件主类，继承自 Obsidian 的 Plugin 类
   - 负责插件的初始化、设置管理、文件上传处理
   - 包含 MinIO 客户端配置、文件类型检测、上传进度显示等功能

2. **图片库视图** (`src/views/MinioGalleryView.ts`)
   - `MinioGalleryView`: 继承自 ItemView，提供图片库管理界面
   - 支持图片网格展示、URL搜索、复制链接、删除图片等功能
   - 集成了图片缓存机制提升性能

3. **模态框组件** (`src/modals/`)
   - `ImagePreviewModal.ts`: 图片全屏预览模态框
   - `ConfirmModal.ts`: 确认操作模态框（如删除确认）

4. **工具类** (`src/utils/`)
   - `ImageCache.ts`: 图片URL缓存管理工具

5. **国际化** (`src/i18n.ts` 和 `src/locale/`)
   - 支持英文、简体中文、繁体中文
   - 基于系统语言自动切换

### 关键功能模块

#### 文件上传流程
1. **事件监听**: 监听编辑器的粘贴和拖拽事件
2. **文件验证**: 检查文件类型（图片、视频、音频、文档）
3. **上传预览**: 显示上传进度条和图片预览
4. **MinIO上传**: 使用预签名URL进行文件上传
5. **URL生成**: 根据配置生成最终访问URL
6. **内容插入**: 将格式化的Markdown内容插入编辑器

#### 对象命名规则
- **命名规则**: `local`（本地文件名）、`time`（时间戳）、`timeAndLocal`（时间戳+本地文件名）
- **路径规则**: `root`（根目录）、`type`（文件类型）、`date`（日期）、`typeAndData`（文件类型+日期）
- **基础路径**: 支持自定义基础路径前缀

#### 图片库功能
- **图片展示**: 网格布局展示所有上传的图片
- **搜索过滤**: 根据URL搜索图片
- **操作功能**: 复制URL、删除图片、全屏预览
- **缓存机制**: 使用ImageCache提升图片加载性能

### 配置管理

插件配置通过 `MinioPluginSettings` 接口定义，包括：
- **MinIO连接配置**: accessKey、secretKey、endpoint、port、bucket、region、SSL
- **高级配置**: basepath（基础路径）、customDomain（自定义域名）
- **预览设置**: 图片、视频、音频、文档预览开关
- **命名规则**: 文件命名和路径规则配置

### 依赖关系

- **核心依赖**:
  - `minio-es`: MinIO客户端库
  - `mime`: MIME类型检测
  - `obsidian`: Obsidian API

- **开发依赖**:
  - `typescript`: TypeScript支持
  - `esbuild`: 构建工具
  - `@types/minio`: MinIO类型定义

### 构建配置

- **TypeScript**: 配置目标为ES6，支持严格类型检查
- **Esbuild**: 打包配置，排除Obsidian内置模块，生成CommonJS格式
- **入口文件**: `src/main.ts` → `main.js`

## 开发注意事项

1. **文件上传**: 使用预签名URL上传，避免在客户端暴露密钥
2. **国际化**: 新增文本需要同时在 `src/locale/en.ts`、`src/locale/zh-cn.ts`、`src/locale/zh-tw.ts` 中添加
3. **错误处理**: 上传失败时需要清理编辑器中的预览内容
4. **性能优化**: 图片库使用懒加载和缓存机制
5. **兼容性**: 需要兼容 Obsidian 桌面端和移动端

## 测试建议

- 测试不同文件类型的上传和预览功能
- 验证各种命名规则和路径规则的组合
- 测试图片库的搜索、删除、预览功能
- 检查国际化文本的显示
- 验证自定义域名和基础路径配置