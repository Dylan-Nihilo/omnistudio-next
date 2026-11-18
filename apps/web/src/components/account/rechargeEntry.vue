<template>
  <router-link to="/account/recharge" class="rechargeEntry" :class="{ compact }" aria-label="积分充值" title="积分充值">
    <icon-coins :size="17" aria-hidden="true" />
    <span>{{ label }}</span>
  </router-link>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string; compact?: boolean }>(), { label: "积分充值", compact: false });
</script>

<style lang="scss" scoped>
.rechargeEntry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 0 0 auto;
  min-height: 36px;
  box-sizing: border-box;
  padding: 0 13px;
  border: 1px solid color-mix(in srgb, var(--uiActionPrimary) 78%, transparent);
  border-radius: 6px;
  color: var(--uiTextOnAccent);
  background: var(--uiActionPrimary);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  transition: filter .16s ease, transform .16s ease;

  &:hover { filter: brightness(1.06); transform: translateY(-1px); }
  &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: 3px; }

  &.compact {
    width: 34px;
    min-height: 32px;
    padding: 0;

    span { display: none; }
  }
}
</style>
