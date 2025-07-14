# 图片和视频

在 VitePress 文档中添加图片和视频的最佳实践

## 图片

### 基本 Markdown 语法

使用标准的 Markdown 语法添加图片：

![Hero Light](./images/hero-light.png)

```md
![Hero Light](./images/hero-light.png)
```

### HTML 标签

使用 HTML 标签获得更多自定义选项：

<img src="./images/hero-light.png" alt="Hero Light" style="border-radius: 8px" width="400" />

```html
<img src="./images/hero-light.png" alt="Hero Light" style="border-radius: 8px" width="400" />
```

### 响应式图片

VitePress 支持明暗主题的响应式图片：

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./images/hero-dark.png">
  <img src="./images/hero-light.png" alt="Hero Image">
</picture>

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./images/hero-dark.png">
  <img src="./images/hero-light.png" alt="Hero Image">
</picture>
```

### 使用 CSS 类控制主题

您也可以使用 CSS 类来控制在不同主题下的显示：

<img src="./images/hero-light.png" alt="Hero Light" class="light-only" />
<img src="./images/hero-dark.png" alt="Hero Dark" class="dark-only" />

```html
<img src="./images/hero-light.png" alt="Hero Light" class="light-only" />
<img src="./images/hero-dark.png" alt="Hero Dark" class="dark-only" />
```

相应的 CSS 样式：

```css
.light-only {
  display: block;
}
.dark-only {
  display: none;
}

html.dark .light-only {
  display: none;
}
html.dark .dark-only {
  display: block;
}
```

## 图片最佳实践

### 路径约定

- 使用相对路径 `./images/` 而不是绝对路径 `/images/`
- 将图片放在与文档相同级别的 `images` 目录中
- 或者将公共图片放在项目根目录的 `public/images/` 中

### 文件组织

```
docs/
├── essentials/
│   ├── images/
│   │   ├── hero-light.png
│   │   └── hero-dark.png
│   └── images.md
└── public/
    └── shared-images/
        └── common-image.png
```

### 性能优化

- 使用现代图片格式（WebP、AVIF）
- 压缩图片以减少文件大小
- 为不同设备提供不同尺寸的图片

```html
<!-- 响应式图片示例 -->
<img 
  src="./images/hero-light.png" 
  alt="Hero Image"
  loading="lazy"
  style="max-width: 100%; height: auto;"
/>
```

## 视频嵌入

### YouTube 视频

<iframe 
  width="560" 
  height="315" 
  src="https://www.youtube.com/embed/4KzFe50RQkQ" 
  title="YouTube 视频播放器" 
  frameborder="0" 
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
  allowfullscreen>
</iframe>

```html
<iframe 
  width="560" 
  height="315" 
  src="https://www.youtube.com/embed/4KzFe50RQkQ" 
  title="YouTube 视频播放器" 
  frameborder="0" 
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
  allowfullscreen>
</iframe>
```

### 本地视频

```html
<video controls width="100%">
  <source src="./videos/demo.mp4" type="video/mp4">
  <source src="./videos/demo.webm" type="video/webm">
  您的浏览器不支持视频标签。
</video>
```

## 无障碍性

- 始终提供有意义的 `alt` 属性
- 确保图片在各种屏幕尺寸下都能正常显示
- 考虑视觉障碍用户的需求

```html
<!-- 好的例子 -->
<img src="./images/dashboard.png" alt="用户仪表板界面，显示服务器状态和性能指标" />

<!-- 避免这样做 -->
<img src="./images/dashboard.png" alt="图片" />
```

## VitePress 特定功能

### 图片懒加载

VitePress 自动为图片添加懒加载功能：

```md
![Large Image](./images/large-image.png)
```

### 图片缩放

点击图片可以查看大图（需要插件支持）：

![可缩放的图片](./images/hero-light.png)

### 自定义容器中的图片

::: tip 提示
![提示图片](./images/hero-light.png)
这是一个在自定义容器中的图片示例。
::: 