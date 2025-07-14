# 可重用代码片段

学习如何创建和使用代码片段来保持文档的一致性

## 什么是代码片段？

代码片段允许您在文档的多个位置重用内容块。这有助于保持一致性并减少重复内容的维护工作。

## 创建代码片段

在 VitePress 中，代码片段通过 Markdown 文件和组件系统实现。

### 基本代码片段

创建 `docs/snippets/api-key-setup.md`：

```md
## 获取 API 密钥

1. 登录到您的仪表板
2. 导航到 **设置** > **API 密钥**
3. 点击 **生成新密钥**
4. 复制密钥并安全地存储
```

### 带参数的代码片段

您可以创建 Vue 组件来实现参数化的代码片段。创建 `docs/.vitepress/components/CodeExample.vue`：

```vue
<template>
  <div class="code-group">
    <div class="code-group-header">
      <span>{{ packageManager }}</span>
    </div>
    <div class="language-bash">
      <pre><code>{{ packageManager }} install {{ packageName }}</code></pre>
    </div>
  </div>
</template>

<script setup>
defineProps({
  packageManager: {
    type: String,
    default: 'npm'
  },
  packageName: {
    type: String,
    required: true
  }
})
</script>
```

## 使用代码片段

### 基本使用

在 VitePress 中包含 Markdown 片段：

```md
<!-- 引入其他 markdown 文件的内容 -->
<<< @/snippets/api-key-setup.md
```

### 组件使用

```md
<!-- 使用 Vue 组件 -->
<CodeExample package-manager="npm" package-name="@mcphub/client" />
<CodeExample package-manager="yarn" package-name="@mcphub/client" />
<CodeExample package-manager="pnpm" package-name="@mcphub/client" />
```

## 代码片段最佳实践

### 文件组织

```
docs/
├── snippets/
│   ├── setup/
│   │   ├── installation.md
│   │   └── configuration.md
│   ├── examples/
│   │   ├── basic-usage.md
│   │   └── advanced-usage.md
│   └── common/
│       ├── prerequisites.md
│       └── troubleshooting.md
└── .vitepress/
    └── components/
        ├── CodeExample.vue
        └── InstallationGuide.vue
```

### 命名约定

- 使用描述性文件名
- 使用连字符分隔单词
- 按主题分组到子文件夹

### 内容指导原则

1. **保持简洁** - 代码片段应该是独立的内容块
2. **避免硬编码** - 对可变内容使用参数
3. **文档化参数** - 在组件中注释必需的参数

### 参数文档

在 Vue 组件中记录所需参数：

```vue
<script setup>
/**
 * 安装指南组件
 * @param packageManager 包管理器名称（npm, yarn, pnpm）
 * @param packageName 要安装的包名称
 * @param framework 目标框架（可选）
 */
defineProps({
  packageManager: {
    type: String,
    default: 'npm',
    validator: (value) => ['npm', 'yarn', 'pnpm'].includes(value)
  },
  packageName: {
    type: String,
    required: true
  },
  framework: {
    type: String,
    default: null
  }
})
</script>
```

## 高级代码片段

### 条件内容

您可以使用条件逻辑来根据参数显示不同的内容：

```vue
<template>
  <div>
    <div v-if="framework === 'react'">
      <h3>React 配置</h3>
      <pre><code>npm install react @mcphub/react-client</code></pre>
    </div>
    
    <div v-else-if="framework === 'vue'">
      <h3>Vue 配置</h3>
      <pre><code>npm install vue @mcphub/vue-client</code></pre>
    </div>
    
    <div v-else>
      <h3>通用配置</h3>
      <pre><code>npm install @mcphub/client</code></pre>
    </div>
  </div>
</template>
```

### 嵌套代码片段

代码片段可以包含其他代码片段：

```md
<!-- prerequisites.md -->
## 前提条件

<<< @/snippets/common/system-requirements.md

## 安装步骤

<<< @/snippets/setup/installation.md
```

## 代码组示例

创建一个可切换的代码组件：

```vue
<!-- CodeGroup.vue -->
<template>
  <div class="code-group">
    <div class="code-group-tabs">
      <button 
        v-for="(tab, index) in tabs" 
        :key="index"
        :class="{ active: activeTab === index }"
        @click="activeTab = index"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="code-group-content">
      <div 
        v-for="(tab, index) in tabs" 
        :key="index"
        v-show="activeTab === index"
      >
        <pre><code>{{ tab.code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  tabs: {
    type: Array,
    required: true
  }
})

const activeTab = ref(0)
</script>
```

使用示例：

```vue
<CodeGroup :tabs="[
  { label: 'npm', code: 'npm install @mcphub/client' },
  { label: 'yarn', code: 'yarn add @mcphub/client' },
  { label: 'pnpm', code: 'pnpm add @mcphub/client' }
]" />
```

## 维护代码片段

### 版本控制

当更新代码片段时：

1. 考虑向后兼容性
2. 更新所有使用该代码片段的页面
3. 测试更改在所有上下文中的效果

### 重构检查清单

- [ ] 确认所有参数仍然有效
- [ ] 验证代码片段在所有使用位置正确渲染
- [ ] 更新相关文档
- [ ] 测试不同参数组合
- [ ] 检查移动端显示效果

### 自动化测试

为代码片段组件创建单元测试：

```javascript
// tests/components/CodeExample.test.js
import { mount } from '@vue/test-utils'
import CodeExample from '@/components/CodeExample.vue'

describe('CodeExample', () => {
  test('renders with default props', () => {
    const wrapper = mount(CodeExample, {
      props: { packageName: 'test-package' }
    })
    expect(wrapper.text()).toContain('npm install test-package')
  })

  test('renders with custom package manager', () => {
    const wrapper = mount(CodeExample, {
      props: { 
        packageName: 'test-package',
        packageManager: 'yarn'
      }
    })
    expect(wrapper.text()).toContain('yarn add test-package')
  })
})
``` 