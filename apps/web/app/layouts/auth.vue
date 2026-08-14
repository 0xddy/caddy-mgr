<template>
  <main class="auth-layout">
    <div class="auth-layout__orb auth-layout__orb--one" />
    <div class="auth-layout__orb auth-layout__orb--two" />

    <div class="auth-shell">
      <aside class="auth-intro">
        <AppLogo />

        <div class="auth-intro__body">
          <p class="auth-intro__eyebrow">CADDY OPERATIONS</p>
          <h2>让每一次配置变更，<br />都清晰可控。</h2>
          <p class="auth-intro__description">
            在一个安全入口中管理实例、审阅差异，完成验证、应用与历史恢复。
          </p>

          <div class="auth-intro__highlights" aria-label="核心能力">
            <span><UIcon name="i-lucide-activity" />状态总览</span>
            <span><UIcon name="i-lucide-file-diff" />变更审阅</span>
            <span><UIcon name="i-lucide-history" />历史恢复</span>
          </div>

          <div class="auth-console" aria-hidden="true">
            <div class="auth-console__bar">
              <span class="auth-console__dots"><i /><i /><i /></span>
              <span>Caddyfile</span>
              <span class="auth-console__ready"><i /> READY</span>
            </div>
            <div class="auth-console__code">
              <div><span>01</span><code>example.com {</code></div>
              <div><span>02</span><code>&nbsp;&nbsp;reverse_proxy 127.0.0.1:8080</code></div>
              <div><span>03</span><code>}</code></div>
            </div>
            <div class="auth-console__footer">
              <UIcon name="i-lucide-shield-check" />
              配置在确认后安全应用
            </div>
          </div>
        </div>

        <p class="auth-intro__footer"><span /> Caddy Manager · Operations workspace</p>
      </aside>

      <section class="auth-stage" aria-label="管理员登录">
        <div class="auth-stage__mobile-brand"><AppLogo /></div>
        <div class="auth-stage__content">
          <slot />
        </div>
        <p class="auth-stage__footer">
          <UIcon name="i-lucide-lock-keyhole" />
          受保护的管理员入口
        </p>
      </section>
    </div>
  </main>
</template>
