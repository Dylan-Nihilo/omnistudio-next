<template>
  <accountShell class="adminPage" title="平台管理" eyebrow="root" description="管理平台 API、模型与个人积分账户。">
    <template #actions><uiButton variant="secondary" :loading="loading" @click="loadAll">刷新平台数据</uiButton><uiButton tag="a" href="#/teams" variant="ghost">查看团队空间</uiButton></template>
    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <uiTabs :modelValue="activeTab" :options="tabs" label="平台管理" @update:modelValue="value => typeof value === 'string' && (activeTab = value)">
      <section v-if="activeTab === 'users'" class="adminSection">
        <header class="sectionHeader">
          <div>
            <h2>用户与个人积分</h2>
            <p>只有 root 拥有平台管理权限，团队 owner 不具备平台管理权限。</p>
            <div class="presenceSummary">
              <span>总用户 {{ users.length }}</span>
              <span class="presenceDot online">在线 {{ totalOnlineCount }}</span>
              <span class="presenceDot away">离开 {{ totalAwayCount }}</span>
              <span class="presenceDot offline">离线 {{ totalOfflineCount }}</span>
            </div>
          </div>
          <div class="sectionActions filterActions">
            <uiSelect class="onlineFilterSelect" :modelValue="onlineFilter" :options="onlineOptions" aria-label="按在线状态筛选" @update:modelValue="updateOnlineFilter" />
            <uiSelect class="workspaceFilterSelect" :modelValue="workspaceFilter" :options="workspaceOptions" aria-label="按工作区筛选" @update:modelValue="updateWorkspaceFilter" />
          </div>
        </header>
        <uiTable :rows="filteredUsers" :columns="userColumns" :loading="loading" emptyText="还没有用户" label="平台用户">
          <template #cell="{ row, column }">
            <span v-if="column.key === 'role'" class="roleLabel">{{ row.isRoot ? 'root' : '用户' }}</span>
            <span v-else-if="column.key === 'presence'">
              <uiTag v-if="userPresence(row)?.status === 'online'" tone="success">{{ '在线' + formatPresenceLocation(userPresence(row)) }}</uiTag>
              <uiTag v-else-if="userPresence(row)?.status === 'away'" tone="neutral">{{ '离开 · ' + formatPresenceTime(userPresence(row)?.lastSeenMs) }}</uiTag>
              <uiTag v-else tone="error">离线</uiTag>
            </span>
            <span v-else-if="column.key === 'workspace'" class="workspaceNames">{{ userWorkspaceLabel(row as AdminUser) }}</span>
            <uiTag v-else-if="column.key === 'status'" :tone="row.status === 'active' ? 'success' : 'error'">{{ row.status === 'active' ? '正常' : '已停用' }}</uiTag>
            <span v-else-if="column.key === 'available' || column.key === 'frozen'">{{ formatCredits(String(row[column.key])) }}</span>
            <div v-else-if="column.key === 'actions'" class="rowActions">
              <uiButton size="small" variant="ghost" :disabled="busy" @click="openCredits(row as AdminUser)">调整积分</uiButton>
              <uiButton size="small" variant="ghost" :disabled="busy" @click="showProjects(row as AdminUser)">查看项目</uiButton>
              <uiButton size="small" variant="ghost" :disabled="busy" @click="openPassword(row as AdminUser)">重置密码</uiButton>
              <uiButton v-if="!row.isRoot" size="small" :variant="row.status === 'active' ? 'danger' : 'secondary'" :disabled="busy" @click="toggleUser(row as AdminUser)">{{ row.status === 'active' ? '停用' : '恢复' }}</uiButton>
            </div>
            <span v-else>{{ row[column.key] }}</span>
          </template>
        </uiTable>
      </section>
      <section v-else-if="activeTab === 'api'" class="adminSection">
        <header class="sectionHeader"><div><h2>API 提供方</h2><p>凭据仅显示配置状态，留空不会覆盖已保存的凭据。</p></div><div class="sectionActions"><uiButton variant="secondary" :disabled="busy" @click="initializeCatalog">添加内置模型目录</uiButton><uiButton :disabled="busy" @click="editProvider()">添加 API</uiButton></div></header>
        <uiTable :rows="configuration?.providers ?? []" :columns="providerColumns" :loading="loading" emptyText="还没有配置 API" label="平台 API"><template #cell="{ row, column }"><span v-if="column.key === 'apiUrl'">{{ (row.config as PlatformProvider['config']).apiUrl }}</span><span v-else-if="column.key === 'credential'" class="credentialBadge" :title="providerCredential(row)">{{ providerCredential(row) }}</span><uiTag v-else-if="column.key === 'enabled'" :tone="row.enabled ? 'success' : 'error'">{{ row.enabled ? '已启用' : '已停用' }}</uiTag><div v-else-if="column.key === 'actions'" class="actionGroup"><uiButton size="small" variant="secondary" :disabled="busy" @click="editProvider(row as PlatformProvider)">配置 API</uiButton><uiButton size="small" variant="danger" :disabled="busy" @click="deleteProvider(row as PlatformProvider)">删除</uiButton></div><span v-else>{{ row[column.key] }}</span></template></uiTable>
        <div class="defaultModelsCard">
          <header class="sectionHeader defaultModelsHeader">
            <div>
              <h2>默认模型配置</h2>
              <p>配置全平台文本对话与创作、图片生成、视频生成的默认首选模型。</p>
            </div>
            <div class="sectionActions">
              <uiButton variant="secondary" :disabled="busy" :loading="busy" @click="submitDefaultModels">保存默认模型</uiButton>
            </div>
          </header>
          <div class="defaultModelsGrid">
            <uiField label="默认文本模型">
              <template #default="{ id }">
                <uiSelect :id="id" :modelValue="defaultTextModel" :options="defaultTextModelOptions" :disabled="busy" @update:modelValue="value => typeof value === 'string' && (defaultTextModel = value)" />
              </template>
            </uiField>
            <uiField label="默认图片模型">
              <template #default="{ id }">
                <uiSelect :id="id" :modelValue="defaultImageModel" :options="defaultImageModelOptions" :disabled="busy" @update:modelValue="value => typeof value === 'string' && (defaultImageModel = value)" />
              </template>
            </uiField>
            <uiField label="默认视频模型">
              <template #default="{ id }">
                <uiSelect :id="id" :modelValue="defaultVideoModel" :options="defaultVideoModelOptions" :disabled="busy" @update:modelValue="value => typeof value === 'string' && (defaultVideoModel = value)" />
              </template>
            </uiField>
          </div>
        </div>
        <header class="sectionHeader modelHeader"><div><h2>平台模型</h2><p>用户只能使用平台启用的模型。</p></div><div class="sectionActions"><uiRadioGroup :modelValue="modelFilter" :options="modelFilterOptions" variant="segmented" aria-label="模型类型筛选" @update:modelValue="updateModelFilter" /><uiButton :disabled="busy || !configuration?.providers.length" @click="editModel()">添加模型</uiButton></div></header>
        <uiTable :rows="filteredModels" :columns="modelColumns" :emptyText="modelFilter === 'all' ? '先配置 API，再添加模型' : '当前类型没有模型'" label="平台模型"><template #cell="{ row, column }"><span v-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span><uiTag v-else-if="column.key === 'enabled'" :tone="row.enabled ? 'success' : 'error'">{{ row.enabled ? '已启用' : '已停用' }}</uiTag><div v-else-if="column.key === 'actions'" class="actionGroup"><uiButton size="small" variant="secondary" :disabled="busy" @click="editModel(row as PlatformModel)">编辑模型</uiButton><uiButton size="small" variant="danger" :disabled="busy" @click="deleteModel(row as PlatformModel)">删除</uiButton></div><span v-else>{{ row[column.key] ?? '—' }}</span></template></uiTable>
      </section>
      <section v-else-if="activeTab === 'prices'" class="adminSection">
        <header class="sectionHeader"><div><h2>积分价格</h2><p>{{ configuration?.priceVersion ? `当前价格版本：${configuration.priceVersion}` : '尚未发布价格。配置后，用户才能使用收费模型。' }}</p></div><div class="sectionActions"><uiRadioGroup :modelValue="priceFilter" :options="modelFilterOptions" variant="segmented" aria-label="积分价格类型筛选" @update:modelValue="updatePriceFilter" /><uiButton :disabled="busy || !priceRows.length || missingPrices" :loading="busy" @click="publishPrices">发布新价格</uiButton></div></header>
        <p class="sectionHint">新任务使用新价格，已开始的任务保持原价格。文本按各类实际 token 与配置费率结算，视频可按分辨率配置积分，1 元＝10 积分。</p>
        <component v-for="group in priceGroups" :is="group.key === 'disabled' ? 'details' : 'div'" :key="group.key" class="priceGroup" :class="{ disabledPrices: group.key === 'disabled' }">
          <summary v-if="group.key === 'disabled'"><uiTag tone="error">已停用模型（{{ group.rows.length }}）</uiTag></summary>
          <uiTable class="priceTable" :rows="group.rows" :columns="priceColumns" rowKey="priceKey" :emptyText="priceFilter === 'all' ? '暂无已启用的模型' : '当前类型没有已启用的模型'" :label="group.key === 'disabled' ? '已停用模型积分价格' : '模型积分价格'">
            <template #cell="{ row, column }">
              <span v-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span>
              <span v-else-if="column.key === 'unit'">{{ priceUnit(row) }}</span>
              <div v-else-if="column.key === 'configDetails'" class="configDetails">
                <uiButton v-if="row.mediaType === 'text'" size="small" variant="ghost" :disabled="busy" @click="openPriceConfig(row as PriceRow, true)">查看配置</uiButton>
                <span v-else class="priceSummary">{{ priceSummary(row as PriceRow) }}</span>
              </div>
              <div v-else-if="column.key === 'creditsPerUnit'" class="priceEditor">
                <uiButton v-if="row.mediaType === 'text' || row.mediaType === 'image' || row.mediaType === 'video' || row.mediaType === 'audio'" size="small" variant="secondary" :disabled="busy" @click="openPriceConfig(row as PriceRow)">修改配置</uiButton>
              </div>
              <span v-else>{{ row[column.key] }}</span>
            </template>
          </uiTable>
        </component>
        <p v-if="missingPrices" class="sectionHint">请为所有已启用模型填写完整有效的价格。</p>
      </section>
      <section v-else-if="activeTab === 'usage'" class="adminSection">
        <header class="sectionHeader">
          <div><h2>开发消耗图表与汇总</h2><p>按筛选条件查看消耗趋势和废片占比，数据在任务结算时增量累计。</p></div>
          <div class="sectionActions"><uiButton variant="secondary" :disabled="usageLoading" @click="loadUsage">刷新汇总</uiButton><uiButton tag="a" :href="usageExportUrl" download>导出 CSV</uiButton></div>
        </header>
        <div class="usageFilterBar">
          <div class="usagePrimaryFilter">
            <uiField label="日期范围"><template #default="{ id }"><el-date-picker :id="id" v-model="usageDateRange" class="usageDateRange" type="daterange" valueFormat="YYYY-MM-DD" rangeSeparator="至" startPlaceholder="开始日期" endPlaceholder="结束日期" clearable /></template></uiField>
          </div>
          <div class="usageFilterActions">
            <uiButton variant="secondary" @click="usageFiltersMoreVisible = true">更多筛选<span v-if="usageExtraFilterCount" class="usageFilterCount">{{ usageExtraFilterCount }}</span></uiButton>
            <uiButton :disabled="usageLoading" @click="loadUsage">查询</uiButton>
          </div>
        </div>
        <uiDialog v-model="usageFiltersMoreVisible" title="更多筛选条件" :width="720">
          <div class="usageFiltersDialog">
            <uiField label="人员"><template #default="{ id }"><uiSelect :id="id" v-model="usageUserId" :options="usageUserOptions" /></template></uiField>
            <uiField label="工作区"><template #default="{ id }"><uiSelect :id="id" v-model="usageWorkspace" :options="usageWorkspaceOptions" /></template></uiField>
            <uiField label="模型"><template #default="{ id }"><uiSelect :id="id" v-model="usageModelId" :options="usageModelOptions" /></template></uiField>
            <uiField label="媒体类型"><template #default="{ id }"><uiSelect :id="id" v-model="usageMediaType" :options="usageMediaTypeOptions" /></template></uiField>
          </div>
          <template #footer><uiButton variant="secondary" @click="usageFiltersMoreVisible = false">完成</uiButton></template>
        </uiDialog>
        <div class="usageDashboard" aria-label="开发消耗图表">
          <div class="usageMetricGrid">
            <div class="usageMetric"><span>筛选后消耗积分</span><strong>{{ usageChartSummary.credits }}</strong></div>
            <div class="usageMetric"><span>请求数</span><strong>{{ usageChartSummary.requests.toLocaleString() }}</strong></div>
            <div class="usageMetric"><span>输出数</span><strong>{{ usageChartSummary.outputs.toLocaleString() }}</strong></div>
            <div class="usageMetric"><span>废片占比</span><strong>{{ usageChartSummary.wasteRate }}</strong></div>
          </div>
          <section class="usageChartCard" aria-labelledby="usageTrendTitle">
            <header class="usageChartHeader">
              <div><h3 id="usageTrendTitle">每日消耗趋势</h3><p>按当前筛选条件汇总，最多展示最近 14 天。</p></div>
              <div class="usageChartActions"><span class="usageLegend"><i aria-hidden="true"></i>消耗积分</span><uiButton size="small" variant="secondary" :disabled="!usageChartPoints.length" @click="exportUsageChart">导出图表</uiButton></div>
            </header>
            <div v-if="usageChartPoints.length" class="usageChartViewport">
              <svg ref="usageChartSvg" class="usageChart" viewBox="0 0 760 260" role="img" aria-label="每日消耗积分柱状图">
                <line x1="44" y1="206" x2="744" y2="206" class="usageChartAxis" />
                <line x1="44" y1="20" x2="44" y2="206" class="usageChartAxis" />
                <g v-for="point in usageChartPoints" :key="point.day" class="usageChartPoint">
                  <rect :x="point.x" :y="point.y" :width="point.width" :height="point.height" rx="4" class="usageChartBar" />
                  <text :x="point.center" y="224" text-anchor="middle">{{ point.label }}</text>
                  <text :x="point.center" :y="Math.max(14, point.y - 6)" text-anchor="middle" class="usageChartValue">{{ point.creditsLabel }}</text>
                </g>
              </svg>
            </div>
            <p v-else class="sectionHint usageChartEmpty">暂无可绘制的消耗数据，查询后将在这里显示趋势。</p>
          </section>
          <div class="usageBreakdownGrid">
            <section class="usageBreakdownCard" aria-labelledby="usageMediaTitle">
              <h3 id="usageMediaTitle">媒体类型分布</h3>
              <div v-if="usageMediaBreakdown.length" class="usageBreakdownList">
                <div v-for="item in usageMediaBreakdown" :key="item.key" class="usageBreakdownRow">
                  <span class="usageBreakdownLabel">{{ item.label }}</span>
                  <span class="usageBreakdownTrack"><i :style="{ width: `${item.percent}%` }"></i></span>
                  <strong>{{ item.creditsLabel }}</strong>
                </div>
              </div>
              <p v-else class="sectionHint usageChartEmpty">暂无媒体类型消耗数据。</p>
            </section>
            <section class="usageBreakdownCard" aria-labelledby="usageModelTitle">
              <h3 id="usageModelTitle">模型消耗排行</h3>
              <div v-if="usageModelBreakdown.length" class="usageBreakdownList">
                <div v-for="item in usageModelBreakdown" :key="item.key" class="usageBreakdownRow">
                  <span class="usageBreakdownLabel" :title="item.label">{{ item.label }}</span>
                  <span class="usageBreakdownTrack"><i :style="{ width: `${item.percent}%` }"></i></span>
                  <strong>{{ item.creditsLabel }}</strong>
                </div>
              </div>
              <p v-else class="sectionHint usageChartEmpty">暂无模型消耗数据。</p>
            </section>
          </div>
        </div>
        <uiTable class="usageSummaryTable" :rows="usageRows" :columns="usageColumns" :loading="usageLoading" emptyText="暂无消耗汇总" label="开发消耗汇总">
          <template #cell="{ row, column }">
            <span v-if="column.key === 'userId'">{{ userName(String(row.userId)) }}</span>
            <span v-else-if="column.key === 'wasteRate'">{{ usageWasteRate(row as UsageSummary) }}</span>
            <span v-else-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span>
            <span v-else>{{ row[column.key] ?? '—' }}</span>
          </template>
        </uiTable>
        <div class="usageReview">
          <h3>待审核输出</h3>
          <div v-if="!usageOutputs.length && !usageLoading" class="sectionHint">暂无待审核图片或视频。</div>
          <div v-for="output in usageOutputs" :key="output.id" class="usageOutputRow">
            <span>{{ output.mediaType === 'video' ? '视频' : '图片' }} · {{ output.outputIndex + 1 }}</span>
            <span class="usageOutputPath">{{ outputPath(output) }}</span>
            <uiButton size="small" variant="secondary" :disabled="busy" @click="markOutput(output.id, 'usable')">采用</uiButton>
            <uiButton size="small" variant="danger" :disabled="busy" @click="markOutput(output.id, 'waste')">废片</uiButton>
          </div>
        </div>
      </section>
      <extensionPanel v-else-if="activeTab === 'extensions'" /><section v-else class="adminSection"><header class="sectionHeader"><h2>管理审计</h2><p>最近 200 条平台操作记录。</p></header><uiTable :rows="audit" :columns="auditColumns" emptyText="还没有操作记录" label="平台审计"><template #cell="{ row, column }"><span v-if="column.key === 'actorUserId'">{{ userName(String(row.actorUserId)) }}</span><span v-else-if="column.key === 'createdAt'">{{ new Date(String(row.createdAt)).toLocaleString('zh-CN', { hour12: false }) }}</span><span v-else-if="column.key === 'metadata'" class="auditDetails">{{ auditText(row.metadata) }}</span><span v-else>{{ auditLabels[String(row.action)] ?? row.action }}</span></template></uiTable></section>
    </uiTabs>
    <uiDialog v-model="creditsVisible" :title="`调整 ${selectedUser?.displayName ?? ''} 的积分`" :width="500" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="adjustCredits"><p class="sectionHint">可用 {{ formatCredits(selectedUser?.available) }} · 冻结 {{ formatCredits(selectedUser?.frozen) }}。正数增加，负数扣回，不允许扣回冻结积分。</p><uiField label="积分变更" required><template #default="{ id }"><uiNumberInput :id="id" v-model="creditAmount" :min="-1000000000" :max="1000000000" :step="1" :precision="0" :disabled="busy" /></template></uiField><uiField label="调整原因" required><template #default="{ id }"><uiInput :id="id" v-model.trim="creditReason" maxlength="500" required :disabled="busy" /></template></uiField><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :disabled="busy || !creditAmount || !creditReason" :loading="busy">确认调整积分</uiButton></form></uiDialog>
    <uiDialog v-model="passwordVisible" :title="`重置 ${selectedUser?.displayName ?? ''} 的密码`" :width="480" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="resetPassword"><p class="sectionHint">重置后该账户的所有会话和服务凭证将被撤销。</p><uiField label="新密码" required><template #default="{ id }"><uiInput :id="id" v-model="newPassword" type="password" minlength="12" maxlength="200" autocomplete="new-password" showPassword required :disabled="busy" /></template></uiField><uiField label="确认新密码" required><template #default="{ id }"><uiInput :id="id" v-model="passwordConfirmation" type="password" autocomplete="new-password" showPassword required :disabled="busy" /></template></uiField><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :loading="busy" :disabled="busy || !newPassword">重置密码</uiButton></form></uiDialog>
    <uiDialog v-model="projectsVisible" :title="`${selectedUser?.displayName ?? ''} 的个人项目`" :width="680"><p v-if="projectsLoading" class="sectionHint">正在读取项目…</p><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><div class="projectList"><uiButton v-for="project in projects" :key="project.directory" variant="secondary" :disabled="busy" @click="openProject(project)"><span>{{ project.name }}</span><icon-arrow-up-right :size="16" aria-hidden="true" /></uiButton><p v-if="!projects.length && !projectsLoading" class="sectionHint">这个账户还没有项目。</p></div></uiDialog>
    <uiDialog v-model="providerVisible" title="配置平台 API" :width="600" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="submitProvider"><uiField label="提供方标识" required><template #default="{ id }"><uiInput :id="id" v-model.trim="providerId" required :readonly="providerEditing" :disabled="busy" placeholder="如 myProvider" /></template></uiField><uiField label="API 地址" required><template #default="{ id }"><uiInput :id="id" v-model.trim="apiUrl" type="url" required :disabled="busy" /></template></uiField><uiField label="文本接口协议"><uiRadioGroup v-model="protocol" :options="protocolOptions" variant="segmented" /></uiField><uiField label="API 凭据" :help="currentMaskedApiKey ? `已保存凭据：${currentMaskedApiKey}（留空保留原凭据）` : undefined"><template #default="{ id }"><uiInput :id="id" v-model="apiKey" type="password" autocomplete="off" showPassword :disabled="busy || removeApiKey" :placeholder="currentMaskedApiKey ? `已配置：${currentMaskedApiKey}，留空保留原凭据` : (credentialConfigured ? '已配置，留空保留原凭据' : '填写此 API 的访问凭据')" /></template></uiField><uiCheckbox v-if="credentialConfigured" v-model="removeApiKey" :disabled="busy">移除已保存的凭据</uiCheckbox><uiCheckbox v-model="providerEnabled" :disabled="busy">启用此 API</uiCheckbox><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :loading="busy" :disabled="busy || !providerId || !apiUrl">保存 API 配置</uiButton></form></uiDialog>
    <uiDialog v-model="modelVisible" title="配置平台模型" :width="640" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="submitModel"><uiField label="API 提供方" required><template #default="{ id }"><uiSelect :id="id" :modelValue="modelProviderId" :options="providerOptions" :disabled="busy || !!editingModelId" @update:modelValue="value => typeof value === 'string' && (modelProviderId = value)" /></template></uiField><uiField label="类型"><uiRadioGroup v-model="mediaType" :options="mediaOptions" variant="segmented" :disabled="!!editingModelId" /></uiField><uiField label="平台模型标识" required><template #default="{ id }"><uiInput v-if="mediaType === 'text'" :id="id" v-model.trim="modelId" required :readonly="!!editingModelId" :disabled="busy" /><uiSelect v-else :id="id" :modelValue="modelId" :options="mediaModelOptions" :disabled="busy || !!editingModelId" placeholder="选择适配器支持的模型" @update:modelValue="value => typeof value === 'string' && (modelId = value)" /></template></uiField><uiField label="显示名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="modelLabel" required :disabled="busy" /></template></uiField><uiField v-if="mediaType === 'text'" label="上游模型标识"><template #default="{ id }"><uiInput :id="id" v-model.trim="apiModelId" :disabled="busy" placeholder="留空使用平台模型标识" /></template></uiField><uiField label="排序"><uiNumberInput v-model="sortOrder" :min="-100000" :max="100000" :step="1" :precision="0" :disabled="busy" /></uiField><uiCheckbox v-model="modelEnabled" :disabled="busy">启用此模型</uiCheckbox><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :disabled="busy || !modelProviderId || !modelId || !modelLabel" :loading="busy">保存模型配置</uiButton></form></uiDialog>
    <uiDialog v-model="priceConfigVisible" :title="`${priceConfigModel?.label ?? ''} 的价格配置`" :width="700" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="savePriceConfig"><template v-if="priceConfigType === 'text'"><p class="sectionHint">费率单位：积分／百万 token，按输入和输出分别计费，支持最多 4 位小数。</p><div class="rateFields"><uiField v-for="field in tokenRateFields" :key="field.key" class="rateField" :label="field.label" required><template #default="{ id }"><uiInput :id="id" :modelValue="textPriceDraft[priceConfigKey]?.[field.key] ?? ''" inputmode="decimal" maxlength="32" :disabled="busy || priceConfigReadOnly" @update:modelValue="value => setTextPriceField(priceConfigKey, field.key, value)" /></template></uiField></div><p class="sectionHint" aria-live="polite">例（按历史用量比例）：{{ textExampleUsageLabel }}，总计：10,000,000 token。<br />实际消耗积分：<strong>{{ textExampleCredits(priceConfigKey) }}</strong>。</p><p v-if="!priceConfigReadOnly && !textPricingInput(priceConfigKey)" class="sectionHint">请输入有效积分费率（0～10 亿，最多 4 位小数）。</p></template><template v-else-if="priceConfigType === 'video'"><p class="sectionHint">所有价格支持最多 4 位小数，视频生视频能力由模型能力决定。</p><uiField label="视频价格模式"><uiRadioGroup v-model="videoPricingModeDraft" :options="videoPricingModeOptions" variant="segmented" :disabled="busy || priceConfigReadOnly || !videoReferenceSupported" /></uiField><p v-if="!videoReferenceSupported" class="sectionHint">该模型未声明视频参考能力，只能使用统一计价。</p><template v-if="videoPricingModeDraft === 'separate'"><div v-for="kind in videoBillingKinds" :key="kind" class="videoPricingGroup"><h3>{{ videoBillingKindLabels[kind] }}</h3><div class="tierList"><div class="tierHeader"><span>分辨率</span><span>每秒积分</span><span aria-hidden="true"></span></div><div v-for="(tier, index) in videoTierDrafts[kind]" :key="index" class="tierRow"><uiInput v-model.trim="tier.resolution" placeholder="如 768P、1080P" :disabled="busy || priceConfigReadOnly" :aria-label="`${videoBillingKindLabels[kind]}第 ${index + 1} 个分辨率`" /><uiInput v-model.trim="tier.credits" inputmode="decimal" placeholder="0.0000" :disabled="busy || priceConfigReadOnly" :aria-label="`${tier.resolution || '分辨率'}每秒积分`" /><uiButton htmlType="button" size="small" variant="danger" :disabled="busy || priceConfigReadOnly" @click="removeVideoTier(kind, index)">删除</uiButton></div><uiButton htmlType="button" variant="secondary" :disabled="busy || priceConfigReadOnly" @click="addVideoTier(kind)">新增分辨率</uiButton></div></div></template><template v-else><div class="tierList"><div class="tierHeader"><span>分辨率</span><span>每秒积分</span><span aria-hidden="true"></span></div><div v-for="(tier, index) in tierDraft" :key="index" class="tierRow"><uiInput v-model.trim="tier.resolution" placeholder="如 768P、1080P" :disabled="busy || priceConfigReadOnly" :aria-label="`第 ${index + 1} 个分辨率`" /><uiInput v-model.trim="tier.credits" inputmode="decimal" placeholder="0.0000" :disabled="busy || priceConfigReadOnly" aria-label="每秒积分" /><uiButton htmlType="button" size="small" variant="danger" :disabled="busy || priceConfigReadOnly" @click="removeTier(index)">删除</uiButton></div><uiButton htmlType="button" variant="secondary" :disabled="busy || priceConfigReadOnly" @click="addTier">新增分辨率</uiButton></div></template></template><template v-else-if="priceConfigType === 'image'"><p class="sectionHint">可按模型支持的图片尺寸设置每张积分（1K、2K、4K 可按需配置，不支持的尺寸无法报价）；支持最多 4 位小数。</p><div class="tierList"><div class="tierHeader"><span>尺寸</span><span>每张积分</span><span aria-hidden="true"></span></div><div v-for="(tier, index) in tierDraft" :key="index" class="tierRow"><uiInput v-model.trim="tier.resolution" placeholder="如 1K、2K、4K" :disabled="busy || priceConfigReadOnly" :aria-label="`第 ${index + 1} 个尺寸`" /><uiInput v-model.trim="tier.credits" inputmode="decimal" placeholder="0.0000" :disabled="busy || priceConfigReadOnly" aria-label="每张积分" /><uiButton htmlType="button" size="small" variant="danger" :disabled="busy || priceConfigReadOnly" @click="removeTier(index)">删除</uiButton></div><div class="tierActions"><uiButton htmlType="button" variant="secondary" :disabled="busy || priceConfigReadOnly" @click="addTier">新增尺寸</uiButton><uiButton htmlType="submit" :disabled="busy || priceConfigReadOnly" :loading="busy">保存价格配置</uiButton></div></div></template><template v-else><uiField label="音频基础价格" required><template #default="{ id }"><uiInput :id="id" v-model="audioPriceDraft" inputmode="decimal" placeholder="0.0000" :disabled="busy || priceConfigReadOnly" /></template></uiField><p class="sectionHint">单位：每 10k 字符，允许 0 表示免费，最多 4 位小数。</p></template><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton v-if="priceConfigType !== undefined && !priceConfigReadOnly" htmlType="submit" :disabled="busy" :loading="busy">保存价格配置</uiButton></form></uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { uiTag, uiButton, uiTabs, uiTable, uiDialog, uiField, uiInput, uiNumberInput, uiSelect, uiRadioGroup, uiCheckbox, useUiFeedback, isUiCancelledError, type UiColumn } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import extensionPanel from "./extensionPanel.vue";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import { getAdminUsers, getAdminOnlineUsers, saveAdminUser, resetAdminPassword, adjustUserCredits, getAdminProjects, getPlatformConfiguration, initializePlatformCatalog, savePlatformProvider, deletePlatformProvider, savePlatformModel, deletePlatformModel, publishPlatformPrices, getPlatformAudit, savePlatformDefaultModels, getAdminUsageSummary, getAdminGenerationOutputs, updateGenerationOutputStatus, getAdminUsageExportUrl, type AdminUser, type UserPresence, type PlatformConfiguration, type PlatformProvider, type PlatformModel, type AuditEntry, type TextPricingInput, type TokenRates, type PlatformPriceInput, type PriceConstraints, type PlatformDefaultModels, type UsageSummary, type GenerationOutput } from "@/lib/accountApi";
import { creditMicros, formatCredits } from "@/lib/creditFormat";
import saveFile from "@/lib/saveFile";
import { usePlatformModelsStore } from "@/stores/platformModels";
import { invalidateNodeModels } from "@omnistudio-next/nodes-scaffold/nodeAi";
const auth = useAuthStore(); const workspace = useWorkspaceStore(); const router = useRouter(); const feedback = useUiFeedback();
const users = ref<AdminUser[]>([]); const configuration = ref<PlatformConfiguration>(); const audit = ref<AuditEntry[]>([]); const loading = ref(false); const busy = ref(false); const errorMessage = ref(""); const dialogError = ref("");
const activeTab = ref("users"); const tabs = [{ value: "users", label: "用户与积分" }, { value: "api", label: "API 与模型" }, { value: "prices", label: "积分价格" }, { value: "usage", label: "消耗图表" }, { value: "extensions", label: "平台扩展" }, { value: "audit", label: "管理审计" }];
const selectedUser = ref<AdminUser>(); const creditsVisible = ref(false); const passwordVisible = ref(false); const projectsVisible = ref(false); const projectsLoading = ref(false); const projects = ref<{ name: string; directory: string }[]>([]); const creditAmount = ref<number | null>(null); const creditReason = ref(""); let creditKey = crypto.randomUUID(); const newPassword = ref(""); const passwordConfirmation = ref("");
const providerVisible = ref(false); const providerId = ref(""); const providerEditing = ref(false); const apiUrl = ref(""); const apiKey = ref(""); const currentMaskedApiKey = ref(""); const credentialConfigured = ref(false); const removeApiKey = ref(false); const providerEnabled = ref(true); const protocol = ref<PlatformProvider["config"]["protocol"]>("openai-completions");
const usageRows = ref<UsageSummary[]>([]); const usageOutputs = ref<GenerationOutput[]>([]); const usageLoading = ref(false); const usageFrom = ref(""); const usageTo = ref(""); const usageUserId = ref("all"); const usageWorkspace = ref("all"); const usageModelId = ref("all"); const usageMediaType = ref("all"); const usageFiltersMoreVisible = ref(false); const usageChartSvg = ref<SVGSVGElement | null>(null);
const protocolOptions = [{ value: "openai-completions", label: "OpenAI Chat" }, { value: "openai-responses", label: "OpenAI Responses" }, { value: "anthropic-messages", label: "Anthropic" }];
const modelVisible = ref(false); const editingModelId = ref(""); const modelProviderId = ref(""); const modelId = ref(""); const modelLabel = ref(""); const apiModelId = ref(""); const modelEnabled = ref(true); const mediaType = ref<PlatformModel["mediaType"]>("text"); const sortOrder = ref<number | null>(0); const modelCapabilities = ref<Record<string, unknown> | undefined>();
const mediaOptions = [{ value: "text", label: "文本" }, { value: "image", label: "图片" }, { value: "video", label: "视频" }]; const mediaLabels: Record<string, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };
type ModelFilter = "all" | Exclude<PlatformModel["mediaType"], "audio">;
const modelFilter = ref<ModelFilter>("all"); const priceFilter = ref<ModelFilter>("all"); const modelFilterOptions = [{ value: "all", label: "全部" }, ...mediaOptions];
const providerOptions = computed(() => configuration.value?.providers.map(provider => ({ value: provider.providerId, label: provider.providerId })) ?? []);
const mediaModelOptions = computed(() => configuration.value?.mediaProviders.find(provider => provider.id === modelProviderId.value)?.models.filter(model => model.type === mediaType.value).map(model => ({ value: model.id, label: model.label ?? model.id })) ?? []);
const defaultTextModel = ref("");
const defaultImageModel = ref("");
const defaultVideoModel = ref("");
function buildDefaultModelOptions(type: "text" | "image" | "video", selectedVal: string) {
  const models = (configuration.value?.models ?? []).filter(m => m.mediaType === type && m.enabled);
  const options = [
    { value: "", label: "未指定（默认使用列表首项）" },
    ...models.map(m => ({
      value: JSON.stringify([m.providerId, m.modelId]),
      label: `${m.label}（${m.providerId}）`,
    })),
  ];
  if (selectedVal && !options.some(opt => opt.value === selectedVal)) {
    try {
      const [providerId, modelId] = JSON.parse(selectedVal);
      options.push({ value: selectedVal, label: `${modelId}（${providerId} - 已停用或缺失）` });
    } catch {}
  }
  return options;
}
const defaultTextModelOptions = computed(() => buildDefaultModelOptions("text", defaultTextModel.value));
const defaultImageModelOptions = computed(() => buildDefaultModelOptions("image", defaultImageModel.value));
const defaultVideoModelOptions = computed(() => buildDefaultModelOptions("video", defaultVideoModel.value));
function parseModelChoice(value: string): { providerId: string; modelId: string } | null {
  if (!value) return null;
  try {
    const [providerId, modelId] = JSON.parse(value);
    if (typeof providerId === "string" && typeof modelId === "string") return { providerId, modelId };
  } catch {}
  return null;
}
async function submitDefaultModels() {
  busy.value = true;
  errorMessage.value = "";
  try {
    const input: PlatformDefaultModels = {
      text: parseModelChoice(defaultTextModel.value),
      image: parseModelChoice(defaultImageModel.value),
      video: parseModelChoice(defaultVideoModel.value),
    };
    await savePlatformDefaultModels(input);
    await loadAll();
    await refreshModels();
    feedback.message({ tone: "success", message: "默认模型配置已保存" });
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
const priceDraft = ref<Record<string, string | null>>({});
type TextPriceDraft = { input: string; output: string };
const textPriceDraft = ref<Record<string, TextPriceDraft>>({});
type PriceRow = PlatformModel & { priceKey: string };
type ResolutionTierDraft = { resolution: string; credits: string | null };
const tierDrafts = ref<Record<string, ResolutionTierDraft[]>>({});
type VideoBillingKind = "textImageToVideo" | "videoToVideo";
const videoBillingKinds: VideoBillingKind[] = ["textImageToVideo", "videoToVideo"];
const videoBillingKindLabels: Record<VideoBillingKind, string> = { textImageToVideo: "文生/图生视频", videoToVideo: "视频生视频" };
const videoPricingModeOptions = [{ value: "unified", label: "统一计价" }, { value: "separate", label: "区分计价" }];
const videoPricingModeDraft = ref<"unified" | "separate">("unified");
const videoTierDrafts = ref<Record<VideoBillingKind, ResolutionTierDraft[]>>({ textImageToVideo: [], videoToVideo: [] });
const videoReferenceSupported = ref(false);
const videoPricingModes = ref<Record<string, "unified" | "separate">>({});
const videoPricingTiers = ref<Record<string, Record<VideoBillingKind, ResolutionTierDraft[]>>>({});
const audioPriceDraft = ref("");
const priceConfigVisible = ref(false);
const priceConfigModel = ref<PriceRow>();
const priceConfigReadOnly = ref(false);
const priceConfigKey = computed(() => priceConfigModel.value?.priceKey ?? "");
const priceConfigType = computed(() => priceConfigModel.value?.mediaType);
const tierDraft = ref<ResolutionTierDraft[]>([]);
const tokenRateFields: { key: keyof TokenRates; label: string }[] = [{ key: "input", label: "输入" }, { key: "output", label: "输出" }];
// 136笔历史usage按占比缩放，并按最大余数分配为整数，总计1000万token。
const textExampleUsage = { input: 9_956_581, output: 43_419 };
const textExampleUsageLabel = tokenRateFields.map(({ key, label }) => `${label}：${textExampleUsage[key].toLocaleString("en-US")}`).join("，");
function priceKey(model: { providerId: string; mediaType: string; modelId: string }) { return JSON.stringify([model.providerId, model.mediaType, model.modelId]); }
const priceRows = computed<PriceRow[]>(() => configuration.value?.models.map(model => ({ ...model, priceKey: priceKey(model) })) ?? []);
const priceGroups = computed(() => {
  const rows = priceRows.value.filter(model => priceFilter.value === "all" || model.mediaType === priceFilter.value);
  return [{ key: "enabled", rows: rows.filter(model => model.enabled) }, { key: "disabled", rows: rows.filter(model => !model.enabled) }].filter(group => group.key === "enabled" || group.rows.length);
});
const filteredModels = computed(() => { const models = configuration.value?.models ?? []; return modelFilter.value === "all" ? models : models.filter(model => model.mediaType === modelFilter.value); });
const missingPrices = computed(() => priceRows.value.some(model => {
  if (!model.enabled) return false;
  if (model.mediaType === "text") return !textPricingInput(model.priceKey);
  if (model.mediaType === "image") return !validImageTiers(tierDrafts.value[model.priceKey] ?? []);
  if (model.mediaType === "video") return !validVideoPricing(model);
  return !isPriceValue(priceDraft.value[model.priceKey]);
}));
type WorkspaceFilter = "all" | "none" | string;
const workspaceFilter = ref<WorkspaceFilter>("all");
const onlineFilter = ref<"all" | "online" | "away" | "offline">("all");
function updateOnlineFilter(value: unknown) { if (typeof value === "string") onlineFilter.value = value as "all" | "online" | "away" | "offline"; }
const totalOnlineCount = computed(() => users.value.filter(u => u.presence?.status === "online").length);
const totalAwayCount = computed(() => users.value.filter(u => u.presence?.status === "away").length);
const totalOfflineCount = computed(() => users.value.filter(u => !u.presence || u.presence.status === "offline").length);
const onlineOptions = computed(() => [
  { value: "all", label: `全部状态 (${users.value.length})` },
  { value: "online", label: `仅在线 (${totalOnlineCount.value})` },
  { value: "away", label: `仅离开 (${totalAwayCount.value})` },
  { value: "offline", label: `仅离线 (${totalOfflineCount.value})` },
]);
function formatPresenceLocation(presence?: UserPresence): string {
  if (!presence?.currentPath) return "";
  const path = presence.currentPath;
  if (path.includes("/workspace")) return " · 画布";
  if (path.includes("/teams")) return " · 团队";
  if (path.includes("/account")) return " · 账户";
  if (path.includes("/admin")) return " · 管理";
  if (path.includes("/home") || path === "#/" || path === "/") return " · 首页";
  return "";
}
function formatPresenceTime(lastSeenMs?: number): string {
  if (!lastSeenMs) return "未知";
  const diffSec = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}小时前`;
}
function userWorkspaces(user: AdminUser) { return user.workspaces ?? []; }
function userPresence(row: unknown): UserPresence | undefined { return (row as AdminUser).presence; }
function userWorkspaceLabel(user: AdminUser) { return userWorkspaces(user).map(workspace => `${workspace.name}${workspace.status === "archived" ? "（已解散）" : ""}`).join("、") || "未加入工作区"; }
const workspaceOptions = computed(() => {
  const workspaces = new Map<string, string>();
  for (const user of users.value) for (const workspace of userWorkspaces(user)) workspaces.set(workspace.id, `${workspace.name}${workspace.status === "archived" ? "（已解散）" : ""}`);
  return [{ value: "all", label: "全部工作区" }, ...[...workspaces.entries()].sort(([, left], [, right]) => left.localeCompare(right, "zh-CN")).map(([value, label]) => ({ value, label })), ...(users.value.some(user => !userWorkspaces(user).length) ? [{ value: "none", label: "未加入工作区" }] : [])];
});
const filteredUsers = computed(() => {
  let list = users.value;
  if (workspaceFilter.value !== "all") {
    list = list.filter(user => workspaceFilter.value === "none" ? !userWorkspaces(user).length : userWorkspaces(user).some(workspace => workspace.id === workspaceFilter.value));
  }
  if (onlineFilter.value !== "all") {
    list = list.filter(user => (user.presence?.status ?? "offline") === onlineFilter.value);
  }
  return list;
});
function updateWorkspaceFilter(value: unknown) { if (typeof value === "string") workspaceFilter.value = value; }
watch(workspaceOptions, options => { if (!options.some(option => option.value === workspaceFilter.value)) workspaceFilter.value = "all"; });
const userColumns: UiColumn[] = [
  { key: "displayName", label: "用户", width: 120, align: "center" },
  { key: "email", label: "邮箱", width: 190, align: "center" },
  { key: "presence", label: "实时状态", width: 120, align: "center" },
  { key: "workspace", label: "工作区", width: 260, align: "center" },
  { key: "role", label: "身份", width: 75, align: "center" },
  { key: "available", label: "可用积分", width: 105, align: "center" },
  { key: "frozen", label: "冻结", width: 85, align: "center" },
  { key: "status", label: "状态", width: 80, align: "center" },
  { key: "actions", label: "操作", width: 340, align: "center" },
];
const providerColumns: UiColumn[] = [{ key: "providerId", label: "提供方", width: 150, align: "center" }, { key: "apiUrl", label: "API 地址", width: 300, align: "left" }, { key: "credential", label: "访问凭据", width: 200, align: "center" }, { key: "enabled", label: "状态", width: 95, align: "center" }, { key: "actions", label: "操作", width: 180, align: "center" }];
const modelColumns: UiColumn[] = [{ key: "label", label: "模型名称", width: 160, align: "center" }, { key: "providerId", label: "提供方", width: 140, align: "center" }, { key: "modelId", label: "模型标识", width: 240, align: "center" }, { key: "mediaType", label: "类型", width: 80, align: "center" }, { key: "enabled", label: "状态", width: 90, align: "center" }, { key: "actions", label: "操作", width: 180, align: "center" }];
const priceColumns: UiColumn[] = [{ key: "label", label: "模型", width: 170, align: "center" }, { key: "providerId", label: "提供方", width: 160, align: "center" }, { key: "mediaType", label: "类型", width: 70, align: "center" }, { key: "unit", label: "计费单位", width: 150, align: "center" }, { key: "configDetails", label: "配置详情", width: 320 }, { key: "creditsPerUnit", label: "价格配置", width: 150, align: "center" }];
const auditColumns: UiColumn[] = [{ key: "action", label: "操作", width: 180, align: "center" }, { key: "actorUserId", label: "操作者", width: 150, align: "center" }, { key: "metadata", label: "详情" }, { key: "createdAt", label: "时间", width: 180, align: "center" }];
const usageColumns: UiColumn[] = [{ key: "day", label: "日期", width: 110 }, { key: "userId", label: "人员", width: 120 }, { key: "workspaceName", label: "工作区", width: 150 }, { key: "modelId", label: "模型", width: 180 }, { key: "mediaType", label: "类型", width: 70 }, { key: "requestCount", label: "请求数", width: 80 }, { key: "capturedCredits", label: "消耗积分", width: 100 }, { key: "outputCount", label: "输出数", width: 80 }, { key: "pendingCount", label: "待审核", width: 80 }, { key: "usableCount", label: "可用", width: 70 }, { key: "wasteCount", label: "废片", width: 70 }, { key: "wasteRate", label: "废片占比", width: 90 }];
const auditLabels: Record<string, string> = { "account.initializeRoot": "初始化 root", "account.register": "用户注册", "account.admin.update": "更新账户", "account.password.change": "修改密码", "account.password.reset": "重置密码", "billing.credits.grant": "发放积分", "billing.credits.adjustment": "调整积分", "billing.transfer": "成员积分划转", "team.create": "创建团队", "team.invite": "邀请成员", "team.acceptInvitation": "加入团队", "team.leave": "退出团队", "team.removeMember": "移除成员", "team.asset.upload": "上传团队资产", "team.asset.remove": "删除共享副本", "team.asset.rename": "重命名资产", "team.archive": "解散团队", "team.restore": "恢复团队", "team.rename": "重命名团队", "platform.provider.save": "配置 API", "platform.provider.delete": "删除 API", "platform.model.save": "配置模型", "platform.model.delete": "删除模型", "platform.prices.publish": "发布价格", "platform.catalog.initialize": "添加内置目录", "platform.defaultModels.save": "配置默认模型" };
const usageUserOptions = computed(() => [{ value: "all", label: "全部人员" }, ...users.value.map(user => ({ value: user.id, label: user.displayName }))]);
const usageWorkspaceOptions = computed(() => {
  const names = new Set<string>();
  for (const row of usageRows.value) if (row.workspaceName) names.add(row.workspaceName);
  for (const user of users.value) for (const workspace of user.workspaces ?? []) names.add(workspace.name);
  return [{ value: "all", label: "全部工作区" }, ...[...names].sort((left, right) => left.localeCompare(right, "zh-CN")).map(name => ({ value: name, label: name }))];
});
const usageModelOptions = computed(() => {
  const models = new Map<string, string>();
  for (const model of configuration.value?.models ?? []) models.set(model.modelId, model.label || model.modelId);
  for (const row of usageRows.value) models.set(row.modelId, row.modelId);
  return [{ value: "all", label: "全部模型" }, ...[...models.entries()].sort(([, left], [, right]) => left.localeCompare(right)).map(([value, label]) => ({ value, label }))];
});
const usageMediaTypeOptions = [{ value: "all", label: "全部类型" }, ...Object.entries(mediaLabels).filter(([value]) => value !== "audio").map(([value, label]) => ({ value, label }))];
const usageDateRange = computed<string[]>({ get: () => usageFrom.value && usageTo.value ? [usageFrom.value, usageTo.value] : [], set: value => { usageFrom.value = value?.[0] ?? ""; usageTo.value = value?.[1] ?? ""; } });
const usageExtraFilterCount = computed(() => [usageUserId.value !== "all", usageWorkspace.value !== "all", usageModelId.value !== "all", usageMediaType.value !== "all"].filter(Boolean).length);
const usageExportUrl = computed(() => getAdminUsageExportUrl({ from: usageFrom.value || undefined, to: usageTo.value || undefined, userId: usageUserId.value === "all" ? undefined : usageUserId.value, workspace: usageWorkspace.value === "all" ? undefined : usageWorkspace.value, modelId: usageModelId.value === "all" ? undefined : usageModelId.value, mediaType: usageMediaType.value === "all" ? undefined : usageMediaType.value as UsageSummary["mediaType"] }));
type UsageChartPoint = { day: string; label: string; credits: number; creditsLabel: string; x: number; center: number; y: number; width: number; height: number };
type UsageBreakdownPoint = { key: string; label: string; creditsLabel: string; percent: number };
function formatMicros(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1_000_000n;
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0");
  return formatCredits(`${negative ? "-" : ""}${whole}.${fraction}`);
}
const usageChartSummary = computed(() => {
  let credits = 0n;
  let requests = 0;
  let outputs = 0;
  let usable = 0;
  let waste = 0;
  for (const row of usageRows.value) {
    try { credits += creditMicros(row.capturedCredits); } catch {}
    requests += Number(row.requestCount) || 0;
    outputs += Number(row.outputCount) || 0;
    usable += Number(row.usableCount) || 0;
    waste += Number(row.wasteCount) || 0;
  }
  const reviewed = usable + waste;
  return { credits: formatMicros(credits), requests, outputs, wasteRate: reviewed ? `${(waste / reviewed * 100).toFixed(2)}%` : "—" };
});
const usageChartPoints = computed<UsageChartPoint[]>(() => {
  const byDay = new Map<string, number>();
  for (const row of usageRows.value) {
    const amount = Number(row.capturedCredits);
    if (!Number.isFinite(amount)) continue;
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + amount);
  }
  const entries = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-14);
  if (!entries.length) return [];
  const maxCredits = Math.max(...entries.map(([, credits]) => credits), 1);
  const chartLeft = 44;
  const chartBottom = 206;
  const chartTop = 20;
  const chartWidth = 700;
  const chartHeight = chartBottom - chartTop;
  const step = chartWidth / Math.max(entries.length, 1);
  const width = Math.min(42, Math.max(12, step * 0.56));
  return entries.map(([day, credits], index) => {
    const center = chartLeft + step * (index + 0.5);
    const height = Math.max(credits > 0 ? 3 : 0, credits / maxCredits * chartHeight);
    return { day, label: day.slice(5).replace("-", "/"), credits, creditsLabel: credits.toLocaleString("zh-CN", { maximumFractionDigits: 2 }), x: center - width / 2, center, y: chartBottom - height, width, height };
  });
});
function usageBreakdown(keyOf: (row: UsageSummary) => string, labelOf: (key: string) => string, limit?: number): UsageBreakdownPoint[] {
  const amounts = new Map<string, number>();
  for (const row of usageRows.value) {
    const amount = Number(row.capturedCredits);
    if (!Number.isFinite(amount)) continue;
    const key = keyOf(row);
    amounts.set(key, (amounts.get(key) ?? 0) + amount);
  }
  const entries = [...amounts.entries()].sort(([, left], [, right]) => right - left);
  const visible = limit ? entries.slice(0, limit) : entries;
  const maxCredits = Math.max(...visible.map(([, credits]) => credits), 1);
  return visible.map(([key, credits]) => ({ key, label: labelOf(key), creditsLabel: credits.toLocaleString("zh-CN", { maximumFractionDigits: 2 }), percent: Math.max(credits > 0 ? 6 : 0, credits / maxCredits * 100) }));
}
const usageMediaBreakdown = computed(() => usageBreakdown(row => row.mediaType, key => mediaLabels[key] ?? key));
const usageModelBreakdown = computed(() => usageBreakdown(row => row.modelId, key => key, 8));
async function exportUsageChart() {
  const source = usageChartSvg.value;
  if (!source) return;
  const chart = source.cloneNode(true) as SVGSVGElement;
  chart.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  chart.setAttribute("width", "760");
  chart.setAttribute("height", "260");
  chart.querySelectorAll(".usageChartAxis").forEach(element => element.setAttribute("stroke", "#d9d4cb"));
  chart.querySelectorAll(".usageChartBar").forEach(element => element.setAttribute("fill", "#b95d33"));
  chart.querySelectorAll("text").forEach(element => { element.setAttribute("fill", "#605d57"); element.setAttribute("font-family", "sans-serif"); element.setAttribute("font-size", "11"); });
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(chart)}`], { type: "image/svg+xml;charset=utf-8" });
  try {
    await saveFile(blob, `usage-trend-${new Date().toISOString().slice(0, 10)}.svg`);
  } catch (error) {
    errorMessage.value = errorText(error);
  }
}
function errorText(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.message || "连接中断，请刷新后确认结果" : error instanceof Error ? error.message : "操作失败，请重试"; }
function userName(id: string) { return users.value.find(user => user.id === id)?.displayName ?? id; }
function providerCredential(row: unknown): string { const provider = row as PlatformProvider; return provider.maskedApiKey || (provider.apiKeyConfigured ? "已配置" : "未配置"); }
function updateModelFilter(value: unknown) { if (value === "all" || value === "text" || value === "image" || value === "video") modelFilter.value = value; }
function updatePriceFilter(value: unknown) { if (value === "all" || value === "text" || value === "image" || value === "video") priceFilter.value = value; }
function auditText(value: unknown) { if (!value || typeof value !== "object") return "—"; return Object.entries(value).filter(([key]) => key !== "items").map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`).join(" · "); }
function setTextPriceField(key: string, field: keyof TextPriceDraft, value: unknown) { const draft = textPriceDraft.value[key]; if (draft && typeof value === "string") draft[field] = value.trim(); }
function textPricingInput(key: string): TextPricingInput | undefined {
  const draft = textPriceDraft.value[key];
  if (!draft) return;
  const ratesPerMillion = {} as TokenRates;
  for (const { key: field } of tokenRateFields) {
    const value = draft[field];
    if (!isPriceValue(value)) return;
    ratesPerMillion[field] = value;
  }
  return { ratesPerMillion };
}
function textExampleCredits(key: string): string {
  const pricing = textPricingInput(key);
  if (!pricing) return "—";
  let numerator = 0n;
  for (const { key: field } of tokenRateFields) {
    const rate = pricing.ratesPerMillion[field];
    numerator += BigInt(textExampleUsage[field]) * creditMicros(rate);
  }
  const amount = (numerator + 500_000n) / 1_000_000n;
  return formatCredits(`${amount / 1_000_000n}.${String(amount % 1_000_000n).padStart(6, "0")}`);
}
function priceUnit(row: Record<string, unknown>): string {
  if (row.mediaType === "video") return "每秒";
  if (row.mediaType === "image") return "每张";
  if (row.mediaType === "text") return "每百万 token";
  const price = configuration.value?.prices.find(item => priceKey(item) === String(row.priceKey));
  return price?.unit === "10k_tokens" ? "旧规则：每万 token" : "旧规则：每万字符";
}
function priceTiers(price: { constraints?: PriceConstraints }, mediaType: "image" | "video") {
  const source = mediaType === "image" ? price.constraints?.sizeTiers : price.constraints?.resolutionTiers;
  return source && typeof source === "object" ? source : {};
}
function isPriceValue(value: unknown): value is string { return typeof value === "string" && value.length <= 32 && /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value) && creditMicros(value) <= 1_000_000_000_000_000n; }
function validTierValues(tiers: ResolutionTierDraft[]) { return tiers.length > 0 && tiers.every(tier => tier.resolution.trim().length > 0 && isPriceValue(tier.credits)); }
function validImageTiers(tiers: ResolutionTierDraft[]) {
  const names = new Set<string>();
  return validTierValues(tiers) && tiers.every(tier => {
    const name = tier.resolution.trim().toUpperCase();
    if (!["1K", "2K", "4K"].includes(name) || names.has(name)) return false;
    names.add(name);
    return true;
  });
}
function supportsVideoReference(value: unknown): boolean {
  if (typeof value === "string") return value === "videoReference" || value.startsWith("videoReference:");
  if (Array.isArray(value)) return value.some(supportsVideoReference);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.videoReference === true || record.supportsVideoReference === true) return true;
    return supportsVideoReference(record.mode);
  }
  return false;
}
function modelSupportsVideoReference(model: PlatformModel) {
  if (supportsVideoReference(model.capabilities)) return true;
  const provider = configuration.value?.mediaProviders.find(item => item.id === model.providerId);
  const source = provider?.models.find(item => item.id === model.modelId && item.type === "video");
  return supportsVideoReference(source?.mode);
}
function validVideoTiers(tiers: ResolutionTierDraft[]) { return validTierValues(tiers); }
function validVideoPricing(model: PlatformModel) {
  const key = priceKey(model);
  const mode = videoPricingModes.value[key] ?? "unified";
  if (mode === "separate" && modelSupportsVideoReference(model)) {
    const tiers = videoPricingTiers.value[key];
    const supported = new Set((model.capabilities?.durationResolutionMap as { resolution?: string[] }[] | undefined)?.flatMap(item => item.resolution ?? []));
    return !!tiers && validVideoTiers(tiers.textImageToVideo) && validVideoTiers(tiers.videoToVideo)
      && [...supported].every(resolution => tiers.textImageToVideo.some(tier => tier.resolution.trim() === resolution) && tiers.videoToVideo.some(tier => tier.resolution.trim() === resolution));
  }
  return validVideoTiers(tierDrafts.value[key] ?? []);
}
function defaultImageTiers(price: { constraints?: PriceConstraints }, basePrice: string | null | undefined) {
  const tiers = priceTiers(price, "image");
  if (Object.keys(tiers).length) return Object.entries(tiers).map(([resolution, credits]) => ({ resolution, credits: String(credits) }));
  const fallback = basePrice ?? null;
  return ["1K", "2K", "4K"].map(resolution => ({ resolution, credits: tiers[resolution] === undefined ? fallback : String(tiers[resolution]) }));
}
function priceTierSummary(row: PriceRow) {
  if (row.mediaType !== "image" && row.mediaType !== "video") return "";
  const price = configuration.value?.prices.find(item => priceKey(item) === row.priceKey);
  if (row.mediaType === "video" && (videoPricingModes.value[row.priceKey] ?? price?.constraints?.videoPricingMode) === "separate") {
    const groups = videoPricingTiers.value[row.priceKey] ?? {
      textImageToVideo: Object.entries(price?.constraints?.videoPricingTiers?.textImageToVideo ?? {}).map(([resolution, credits]) => ({ resolution, credits: String(credits) })),
      videoToVideo: Object.entries(price?.constraints?.videoPricingTiers?.videoToVideo ?? {}).map(([resolution, credits]) => ({ resolution, credits: String(credits) })),
    };
    return videoBillingKinds.map(kind => `${videoBillingKindLabels[kind]}：${groups[kind].map(tier => `${tier.resolution} ${tier.credits ?? "—"}`).join(" · ") || "未配置"}`).join("；");
  }
  const tiers = tierDrafts.value[row.priceKey] ?? Object.entries(priceTiers(price ?? {}, row.mediaType)).map(([resolution, credits]) => ({ resolution, credits }));
  return tiers.length ? tiers.map(tier => `${tier.resolution}：${tier.credits == null ? "—" : `${tier.credits}积分`}`).join(" · ") : "未配置档位";
}
function priceSummary(row: PriceRow) {
  if (row.mediaType === "text") return "";
  if (row.mediaType !== "image" && row.mediaType !== "video") return `基础价格：${priceDraft.value[row.priceKey] ?? "未配置"}`;
  const summary = priceTierSummary(row);
  return summary === "未配置档位" ? `基础价格：${priceDraft.value[row.priceKey] == null ? "未配置" : `${priceDraft.value[row.priceKey]}积分`}` : summary;
}
function openPriceConfig(row: PriceRow, readOnly = false) {
  priceConfigModel.value = row;
  priceConfigReadOnly.value = readOnly;
  dialogError.value = "";
  audioPriceDraft.value = priceDraft.value[row.priceKey] ?? "";
  if (row.mediaType === "video") {
    const price = configuration.value?.prices.find(item => priceKey(item) === row.priceKey);
    const mode = price?.constraints?.videoPricingMode;
    videoPricingModeDraft.value = videoPricingModes.value[row.priceKey] ?? (mode === "separate" && modelSupportsVideoReference(row) ? "separate" : "unified");
    videoReferenceSupported.value = modelSupportsVideoReference(row);
    const unified = price?.constraints?.resolutionTiers ?? {};
    const separate = price?.constraints?.videoPricingTiers;
    tierDraft.value = Object.entries(unified).map(([resolution, credits]) => ({ resolution, credits: String(credits) }));
    const unifiedTiers = Object.entries(unified).map(([resolution, credits]) => ({ resolution, credits: String(credits) }));
    const separateTextTiers = Object.entries(separate?.textImageToVideo ?? {}).map(([resolution, credits]) => ({ resolution, credits: String(credits) }));
    const separateVideoTiers = Object.entries(separate?.videoToVideo ?? {}).map(([resolution, credits]) => ({ resolution, credits: String(credits) }));
    videoTierDrafts.value = videoPricingTiers.value[row.priceKey] ?? {
      textImageToVideo: separateTextTiers.length ? separateTextTiers : unifiedTiers.map(tier => ({ ...tier })),
      videoToVideo: separateVideoTiers.length ? separateVideoTiers : unifiedTiers.map(tier => ({ ...tier })),
    };
  } else if (row.mediaType === "image") {
    const price = configuration.value?.prices.find(item => priceKey(item) === row.priceKey);
    const tiers = tierDrafts.value[row.priceKey] ?? (row.mediaType === "image" ? defaultImageTiers(price ?? {}, priceDraft.value[row.priceKey]) : Object.entries(priceTiers(price ?? {}, "video")).map(([resolution, credits]) => ({ resolution, credits })));
    tierDraft.value = tiers.map(tier => ({ ...tier }));
  }
  priceConfigVisible.value = true;
}
function addTier() { tierDraft.value.push({ resolution: "", credits: null }); }
function removeTier(index: number) { tierDraft.value.splice(index, 1); }
function addVideoTier(kind: VideoBillingKind) { videoTierDrafts.value[kind].push({ resolution: "", credits: null }); }
function removeVideoTier(kind: VideoBillingKind, index: number) { videoTierDrafts.value[kind].splice(index, 1); }
function savePriceConfig() {
  const model = priceConfigModel.value;
  if (!model) return;
  if (priceConfigReadOnly.value) { priceConfigVisible.value = false; return; }
  if (model.mediaType === "text") {
    if (!textPricingInput(model.priceKey)) { dialogError.value = "请输入有效积分费率（0～10 亿，最多 4 位小数）"; return; }
    priceConfigVisible.value = false;
    return;
  }
  if (model.mediaType === "audio") {
    if (!isPriceValue(audioPriceDraft.value)) { dialogError.value = "请输入有效音频价格（最多 4 位小数）"; return; }
    priceDraft.value[model.priceKey] = audioPriceDraft.value;
    priceConfigVisible.value = false;
    return;
  }
  if (model.mediaType === "video") {
    if (videoPricingModeDraft.value === "separate" && !videoReferenceSupported.value) { dialogError.value = "当前模型不支持视频生视频，只能统一计价"; videoPricingModeDraft.value = "unified"; return; }
    const groups = videoPricingModeDraft.value === "separate" ? videoBillingKinds.map(kind => videoTierDrafts.value[kind]) : [tierDraft.value];
    if (groups.some(group => !validVideoTiers(group))) { dialogError.value = "请为视频填写至少一个有效分辨率和价格（最多 4 位小数）"; return; }
    const normalized = (group: ResolutionTierDraft[]) => group.map(tier => ({ resolution: tier.resolution.trim(), credits: tier.credits! }));
    if (videoPricingModeDraft.value === "separate") {
      videoTierDrafts.value = { textImageToVideo: normalized(videoTierDrafts.value.textImageToVideo), videoToVideo: normalized(videoTierDrafts.value.videoToVideo) };
      videoPricingTiers.value[model.priceKey] = videoTierDrafts.value;
    } else {
      tierDraft.value = normalized(tierDraft.value);
      tierDrafts.value[model.priceKey] = tierDraft.value;
    }
    videoPricingModes.value[model.priceKey] = videoPricingModeDraft.value;
    priceConfigVisible.value = false;
    return;
  }
  const tiers = tierDraft.value.map(tier => ({ resolution: tier.resolution.trim(), credits: tier.credits }));
  const names = new Set<string>();
  if (model.mediaType === "image" && tiers.length === 0) { dialogError.value = "图片至少配置一个尺寸价格"; return; }
  for (const tier of tiers) {
    const name = tier.resolution.toUpperCase();
    if (!name || name.length > 32) { dialogError.value = `${model.mediaType === "image" ? "尺寸" : "分辨率"}名称不能为空且不能超过 32 个字符`; return; }
    if (model.mediaType === "image" && !["1K", "2K", "4K"].includes(name)) { dialogError.value = "图片尺寸仅支持 1K、2K、4K"; return; }
    if (names.has(name)) { dialogError.value = `${model.mediaType === "image" ? "尺寸" : "分辨率"}名称不能重复`; return; }
    if (!isPriceValue(tier.credits)) { dialogError.value = "档位积分必须是非负数且最多 4 位小数"; return; }
    names.add(name);
  }
  const normalizedTiers = tiers.map(tier => ({ ...tier, resolution: model.mediaType === "image" ? tier.resolution.toUpperCase() : tier.resolution }));
  tierDrafts.value[model.priceKey] = normalizedTiers;
  if (tiers.length) priceDraft.value[model.priceKey] = tiers.reduce((max, tier) => creditMicros(tier.credits!) > creditMicros(max) ? tier.credits! : max, "0");
  priceConfigVisible.value = false;
}
function usageWasteRate(row: UsageSummary) {
  const denominator = row.usableCount + row.wasteCount;
  return denominator ? `${(row.wasteCount / denominator * 100).toFixed(2)}%` : "—";
}
function outputPath(output: GenerationOutput) {
  const snapshot = output.outputSnapshot && typeof output.outputSnapshot === "object" ? output.outputSnapshot as { path?: unknown } : {};
  return typeof snapshot.path === "string" ? snapshot.path : `输出 ${output.outputIndex + 1}`;
}
async function loadUsage() {
  usageLoading.value = true;
  try {
    const filters = { from: usageFrom.value || undefined, to: usageTo.value || undefined, userId: usageUserId.value === "all" ? undefined : usageUserId.value, workspace: usageWorkspace.value === "all" ? undefined : usageWorkspace.value, modelId: usageModelId.value === "all" ? undefined : usageModelId.value, mediaType: usageMediaType.value === "all" ? undefined : usageMediaType.value as UsageSummary["mediaType"] };
    const [summary, outputs] = await Promise.all([getAdminUsageSummary({ ...filters, limit: 5000 }), getAdminGenerationOutputs({ status: "pending", userId: filters.userId, limit: 500 } )]);
    usageRows.value = summary;
    usageOutputs.value = outputs;
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    usageLoading.value = false;
  }
}
async function markOutput(id: string, status: "usable" | "waste") {
  let wasteReason: string | undefined;
  if (status === "waste") {
    const reason = window.prompt("请输入废片原因");
    if (!reason?.trim()) return;
    wasteReason = reason.trim();
  }
  busy.value = true;
  try {
    await updateGenerationOutputStatus(id, status, wasteReason);
    await loadUsage();
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
async function loadAll() {
  loading.value = true; errorMessage.value = "";
  try {
    const [people, platform, events] = await Promise.all([getAdminUsers(), getPlatformConfiguration(), getPlatformAudit()]);
    configuration.value = platform;
    const prices: Record<string, string | null> = {};
    const textPrices: Record<string, TextPriceDraft> = {};
    const tiers: Record<string, ResolutionTierDraft[]> = {};
    const videoModes: Record<string, "unified" | "separate"> = {};
    const videoTiers: Record<string, Record<VideoBillingKind, ResolutionTierDraft[]>> = {};
    for (const model of platform.models) {
      const key = priceKey(model);
      const price = platform.prices.find(item => priceKey(item) === key);
      prices[key] = price?.creditsPerUnit ?? null;
      if (model.mediaType !== "text") continue;
      const pricing = price?.constraints?.textPricing;
      textPrices[key] = { input: pricing?.ratesPerMillion?.input ?? "", output: pricing?.ratesPerMillion?.output ?? "" };
    }
    for (const model of platform.models) {
      if (model.mediaType !== "video" && model.mediaType !== "image") continue;
      const key = priceKey(model);
      const price = platform.prices.find(item => priceKey(item) === key);
      const entries = model.mediaType === "image" ? Object.entries(priceTiers(price ?? {}, "image")) : Object.entries(priceTiers(price ?? {}, "video"));
      if (entries.length) tiers[key] = entries.map(([resolution, credits]) => ({ resolution, credits: String(credits) }));
      if (model.mediaType === "video") {
        const mode = price?.constraints?.videoPricingMode;
        videoModes[key] = mode === "separate" && modelSupportsVideoReference(model) ? "separate" : "unified";
        const separate = price?.constraints?.videoPricingTiers;
        videoTiers[key] = {
          textImageToVideo: Object.entries(separate?.textImageToVideo ?? {}).map(([resolution, credits]) => ({ resolution, credits: String(credits) })),
          videoToVideo: Object.entries(separate?.videoToVideo ?? {}).map(([resolution, credits]) => ({ resolution, credits: String(credits) })),
        };
      }
    }
    users.value = people; audit.value = events; priceDraft.value = prices; textPriceDraft.value = textPrices; tierDrafts.value = tiers; videoPricingModes.value = videoModes; videoPricingTiers.value = videoTiers; configuration.value = platform;
    const defaults = platform.defaultModels;
    defaultTextModel.value = defaults?.text ? JSON.stringify([defaults.text.providerId, defaults.text.modelId]) : "";
    defaultImageModel.value = defaults?.image ? JSON.stringify([defaults.image.providerId, defaults.image.modelId]) : "";
    defaultVideoModel.value = defaults?.video ? JSON.stringify([defaults.video.providerId, defaults.video.modelId]) : "";
  } catch (error) { errorMessage.value = errorText(error); } finally { loading.value = false; }
}
async function refreshModels() { invalidateNodeModels("language"); invalidateNodeModels("media"); await usePlatformModelsStore().load(); }
function openCredits(user: AdminUser) { selectedUser.value = user; creditAmount.value = null; creditReason.value = ""; dialogError.value = ""; creditsVisible.value = true; }
watch([creditAmount, creditReason], () => { creditKey = crypto.randomUUID(); });
async function adjustCredits() { const user = selectedUser.value; if (!user || !creditAmount.value) return; const input = { userId: user.id, amount: creditAmount.value, reason: creditReason.value, key: creditKey }; try { await feedback.confirm(`为 ${user.displayName}（${user.email}）${input.amount > 0 ? '增加' : '扣回'} ${formatCredits(Math.abs(input.amount))} 积分。原因：${input.reason}`, "确认个人积分调整", { danger: input.amount < 0, confirmButtonText: "调整积分", cancelButtonText: "取消" }); busy.value = true; await adjustUserCredits(input.userId, input.amount, input.reason, input.key); creditsVisible.value = false; await loadAll(); } catch (error) { if (!isUiCancelledError(error)) dialogError.value = errorText(error); } finally { busy.value = false; } }
function openPassword(user: AdminUser) { selectedUser.value = user; newPassword.value = ""; passwordConfirmation.value = ""; dialogError.value = ""; passwordVisible.value = true; }
async function resetPassword() { const user = selectedUser.value; if (!user) return; if (newPassword.value !== passwordConfirmation.value) { dialogError.value = "两次输入的密码不一致"; return; } try { await feedback.confirm(`重置 ${user.displayName}（${user.email}）的密码？该账户将退出所有会话，服务凭证也会停用。`, "重置账户密码", { danger: true, confirmButtonText: "重置密码", cancelButtonText: "取消" }); busy.value = true; await resetAdminPassword(user.id, newPassword.value); passwordVisible.value = false; if (user.id === auth.user?.id) { auth.clear(); location.hash = "/auth/login"; location.reload(); } else await loadAll(); } catch (error) { if (!isUiCancelledError(error)) dialogError.value = errorText(error); } finally { busy.value = false; } }
async function toggleUser(user: AdminUser) { try { await feedback.confirm(`${user.status === 'active' ? '停用' : '恢复'} ${user.displayName}（${user.email}）？${user.status === 'active' ? '该账户将立即失去访问权限，个人资产与积分仍保留。' : '该账户可重新登录，服务凭证需要重新启用。'}`, "更新账户状态", { danger: user.status === "active", confirmButtonText: user.status === "active" ? "停用账户" : "恢复账户", cancelButtonText: "取消" }); busy.value = true; await saveAdminUser(user.id, { status: user.status === "active" ? "disabled" : "active" }); await loadAll(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function showProjects(user: AdminUser) { selectedUser.value = user; projects.value = []; dialogError.value = ""; projectsVisible.value = true; projectsLoading.value = true; try { projects.value = await getAdminProjects(user.id); } catch (error) { dialogError.value = errorText(error); } finally { projectsLoading.value = false; } }
async function openProject(project: { directory: string; name: string }) { busy.value = true; try { await workspace.openProject(project.directory, project.directory, undefined, { addToProjectList: false }); workspace.renameProject(workspace.project?.directory ?? project.directory, project.name); projectsVisible.value = false; await router.push("/workspace"); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
function editProvider(provider?: PlatformProvider) { dialogError.value = ""; providerEditing.value = !!provider; providerId.value = provider?.providerId ?? ""; apiUrl.value = provider?.config.apiUrl ?? ""; protocol.value = provider?.config.protocol ?? "openai-completions"; apiKey.value = ""; currentMaskedApiKey.value = provider?.maskedApiKey ?? ""; removeApiKey.value = false; credentialConfigured.value = provider?.apiKeyConfigured ?? false; providerEnabled.value = provider?.enabled ?? true; providerVisible.value = true; }
async function submitProvider() { const input = { providerId: providerId.value, apiUrl: apiUrl.value, protocol: protocol.value, enabled: providerEnabled.value, ...(removeApiKey.value ? { removeApiKey: true } : apiKey.value ? { apiKey: apiKey.value } : {}) }; try { if ("removeApiKey" in input && input.removeApiKey) await feedback.confirm(`移除 ${input.providerId} 的访问凭据？依赖此 API 的模型将无法调用。`, "移除 API 凭据", { danger: true, confirmButtonText: "移除凭据", cancelButtonText: "保留凭据" }); busy.value = true; await savePlatformProvider(input); apiKey.value = ""; currentMaskedApiKey.value = ""; providerVisible.value = false; await loadAll(); await refreshModels(); } catch (error) { if (!isUiCancelledError(error)) dialogError.value = errorText(error); } finally { busy.value = false; } }
async function deleteProvider(provider: PlatformProvider) { try { await feedback.confirm(`删除 API 提供方「${provider.providerId}」？该 API 的凭据和所属模型都会删除，历史任务与价格记录保留。`, "删除 API 提供方", { danger: true, confirmButtonText: "删除 API", cancelButtonText: "保留 API" }); busy.value = true; await deletePlatformProvider(provider.providerId); await loadAll(); await refreshModels(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
function editModel(model?: PlatformModel) { dialogError.value = ""; editingModelId.value = model?.id ?? ""; modelProviderId.value = model?.providerId ?? providerOptions.value[0]?.value ?? ""; modelId.value = model?.modelId ?? ""; modelLabel.value = model?.label ?? ""; apiModelId.value = model?.apiModelId ?? ""; mediaType.value = model?.mediaType ?? "text"; modelEnabled.value = !!(model?.enabled ?? 1); sortOrder.value = model?.sortOrder ?? 0; modelCapabilities.value = model?.capabilities ?? undefined; modelVisible.value = true; }
async function submitModel() { busy.value = true; dialogError.value = ""; try { await savePlatformModel({ ...(editingModelId.value ? { id: editingModelId.value } : {}), providerId: modelProviderId.value, modelId: modelId.value, label: modelLabel.value, mediaType: mediaType.value, enabled: modelEnabled.value, sortOrder: sortOrder.value ?? 0, ...(mediaType.value === "text" && apiModelId.value ? { apiModelId: apiModelId.value } : {}), ...(modelCapabilities.value ? { capabilities: modelCapabilities.value } : {}) }); modelVisible.value = false; await loadAll(); await refreshModels(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function deleteModel(model: PlatformModel) { try { await feedback.confirm(`删除模型「${model.label}」？历史任务与价格记录保留，后续新任务将无法使用。`, "删除平台模型", { danger: true, confirmButtonText: "删除模型", cancelButtonText: "保留模型" }); busy.value = true; await deletePlatformModel(model.id); await loadAll(); await refreshModels(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function initializeCatalog() { busy.value = true; try { await initializePlatformCatalog(); await loadAll(); await refreshModels(); } catch (error) { errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function publishPrices() {
  if (missingPrices.value) return;
  const items: PlatformPriceInput[] = [];
  for (const model of priceRows.value) {
    const textPricing = model.mediaType === "text" ? textPricingInput(model.priceKey) : undefined;
    if (model.mediaType === "text" && !textPricing) continue;
    const creditsPerUnit = textPricing ? "0.0000" : priceDraft.value[model.priceKey];
    if (creditsPerUnit == null) continue;
    const previous = configuration.value?.prices.find(item => priceKey(item) === model.priceKey);
    const { resolutionTiers: previousResolutionTiers, sizeTiers: previousSizeTiers, videoPricingMode: previousVideoPricingMode, videoPricingTiers: previousVideoPricingTiers, ...constraints } = previous?.constraints ?? {};
    delete constraints.textPricing;
    let finalCreditsPerUnit = creditsPerUnit;
    if (model.mediaType === "image" || model.mediaType === "video") {
      const previousTiers = model.mediaType === "image" ? previousSizeTiers : previousResolutionTiers;
      const draftTiers = tierDrafts.value[model.priceKey];
      const tierValues = draftTiers ?? (previousTiers ? Object.entries(previousTiers).map(([resolution, credits]) => ({ resolution, credits })) : []);
      if (tierValues.length) {
        if (model.mediaType === "image") constraints.sizeTiers = Object.fromEntries(tierValues.map(tier => [tier.resolution.trim().toUpperCase(), tier.credits!]));
        else constraints.resolutionTiers = Object.fromEntries(tierValues.map(tier => [tier.resolution.trim(), tier.credits!]));
        finalCreditsPerUnit = tierValues.reduce((max, tier) => creditMicros(tier.credits!) > creditMicros(max) ? tier.credits! : max, "0");
      }
    }
    if (model.mediaType === "video") {
      delete constraints.resolutionTiers;
      const mode = videoPricingModes.value[model.priceKey] ?? "unified";
      if (mode === "separate") constraints.videoPricingTiers = {
        textImageToVideo: Object.fromEntries((videoPricingTiers.value[model.priceKey]?.textImageToVideo ?? []).map(tier => [tier.resolution.trim(), tier.credits!])),
        videoToVideo: Object.fromEntries((videoPricingTiers.value[model.priceKey]?.videoToVideo ?? []).map(tier => [tier.resolution.trim(), tier.credits!])),
      };
      constraints.videoPricingMode = mode;
      if (mode === "unified") constraints.resolutionTiers = Object.fromEntries((tierDrafts.value[model.priceKey] ?? []).map(tier => [tier.resolution.trim(), tier.credits!]));
      const allTiers = mode === "separate" ? [...(videoPricingTiers.value[model.priceKey]?.textImageToVideo ?? []), ...(videoPricingTiers.value[model.priceKey]?.videoToVideo ?? [])] : (tierDrafts.value[model.priceKey] ?? []);
      finalCreditsPerUnit = allTiers.reduce((max, tier) => creditMicros(tier.credits!) > creditMicros(max) ? tier.credits! : max, "0");
    }
    items.push({ providerId: model.providerId, modelId: model.modelId, mediaType: model.mediaType, creditsPerUnit: finalCreditsPerUnit, ...(Object.keys(constraints).length ? { constraints } : {}), ...(textPricing ? { textPricing } : {}) });
  }
  const free = items.filter(item => item.textPricing ? Object.values(item.textPricing.ratesPerMillion).every(rate => creditMicros(rate) === 0n) : creditMicros(item.creditsPerUnit) === 0n).length;
  try { await feedback.confirm(`发布 ${items.length} 个模型的新价格？${free ? `其中 ${free} 个模型不扣积分。` : ''}已开始的任务按原价格结算。`, "发布模型积分价格", { confirmButtonText: "发布新价格", cancelButtonText: "继续编辑" }); busy.value = true; await publishPlatformPrices(items); await loadAll(); }
  catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); }
  finally { busy.value = false; }
}

async function refreshOnlinePresences() {
  if (activeTab.value !== "users") return;
  try {
    const data = await getAdminOnlineUsers();
    const onlineMap = new Map(data.users.map(u => [u.userId, u]));
    for (const user of users.value) {
      const active = onlineMap.get(user.id);
      if (active) {
        user.presence = { status: active.status, currentPath: active.currentPath, lastSeenMs: active.lastSeenMs };
      } else if (user.presence && user.presence.status !== "offline") {
        user.presence = { status: "offline", lastSeenMs: user.presence.lastSeenMs };
      }
    }
  } catch {
    // 轮询静默失败
  }
}

let presencePollTimer: ReturnType<typeof setInterval> | undefined;
function startPresencePolling() {
  stopPresencePolling();
  presencePollTimer = setInterval(() => {
    void refreshOnlinePresences();
  }, 12_000);
}
function stopPresencePolling() {
  if (presencePollTimer) {
    clearInterval(presencePollTimer);
    presencePollTimer = undefined;
  }
}

watch(activeTab, tab => {
  if (tab !== "usage") usageFiltersMoreVisible.value = false;
  if (tab === "users") {
    startPresencePolling();
  } else {
    stopPresencePolling();
  }
  if (tab === "usage") void loadUsage();
});

onMounted(() => {
  void loadAll();
  startPresencePolling();
});

onUnmounted(() => {
  stopPresencePolling();
});
</script>

<style lang="scss" scoped>
.adminPage {
  :deep(.uiTable th) { text-align: center !important; }
  .usageSummaryTable :deep(td) { text-align: center !important; }
}
.pageError { color: var(--uiStatusError); margin: 0 0 20px; font-size: var(--uiFontControl); line-height: 1.6; overflow-wrap: anywhere; }
.adminSection {
  min-width: 0;
  .usageFilterBar { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; padding: 16px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); }
  .usagePrimaryFilter { flex: 1 1 340px; min-width: 260px; max-width: 440px; }
  .usagePrimaryFilter .uiField { width: 100%; }
  :deep(.usageDateRange) { width: 100%; }
  .usageFilterActions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .usageFilterCount { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; border-radius: 999px; color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-size: 11px; line-height: 1; }
  .usageFiltersDialog { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
  .usageDashboard { display: grid; gap: 16px; margin-bottom: 28px; }
  .usageMetricGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .usageMetric { display: grid; gap: 8px; padding: 16px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); span { color: var(--uiTextMuted); font-size: 12px; } strong { color: var(--uiTextBody); font-size: 22px; font-weight: 600; } }
  .usageChartCard { padding: 20px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); }
  .usageChartHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; h3 { margin: 0 0 6px; font-size: 16px; } p { margin: 0; color: var(--uiTextMuted); font-size: 12px; } }
  .usageChartActions { display: flex; align-items: center; gap: 14px; }
  .usageLegend { display: inline-flex; align-items: center; gap: 6px; color: var(--uiTextMuted); font-size: 12px; white-space: nowrap; i { width: 9px; height: 9px; border-radius: 2px; background: var(--uiActionPrimary, #b95d33); } }
  .usageChartViewport { width: 100%; overflow-x: auto; }
  .usageChart { display: block; width: 100%; min-width: 520px; height: 260px; overflow: visible; }
  .usageChartAxis { stroke: var(--uiBorderControl); stroke-width: 1; }
  .usageChartBar { fill: var(--uiActionPrimary, #b95d33); opacity: 0.88; }
  .usageChartPoint text { fill: var(--uiTextMuted); font-size: 11px; }
  .usageChartPoint .usageChartValue { fill: var(--uiTextSecondary); font-size: 10px; }
  .usageChartEmpty { margin: 40px 0; text-align: center; }
  .usageBreakdownGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .usageBreakdownCard { min-width: 0; padding: 20px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); h3 { margin: 0 0 16px; font-size: 16px; } }
  .usageBreakdownList { display: grid; gap: 13px; }
  .usageBreakdownRow { display: grid; grid-template-columns: minmax(70px, 110px) minmax(0, 1fr) auto; align-items: center; gap: 10px; min-width: 0; }
  .usageBreakdownLabel { overflow: hidden; color: var(--uiTextSecondary); text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .usageBreakdownTrack { height: 8px; overflow: hidden; border-radius: 999px; background: var(--uiBorderControl); }
  .usageBreakdownTrack i { display: block; height: 100%; border-radius: inherit; background: var(--uiActionPrimary, #b95d33); }
  .usageBreakdownRow strong { min-width: 64px; color: var(--uiTextBody); font-size: 12px; font-weight: 600; text-align: right; }
  .usageReview { margin-top: 28px; h3 { margin: 0 0 12px; font-size: 16px; } }
  .usageOutputRow { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--uiBorder); }
  .usageOutputPath { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uiTextMuted); }
  .sectionHeader {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin: 8px 0 24px;
    h2 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
    .sectionActions {
      display: flex; gap: 8px; flex-wrap: wrap;
      &.filterActions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: nowrap;
        .onlineFilterSelect {
          width: 175px;
          flex-shrink: 0;
          :deep(.optionLabel) {
            white-space: nowrap;
          }
        }
        .workspaceFilterSelect {
          width: 185px;
          flex-shrink: 0;
          :deep(.optionLabel) {
            white-space: nowrap;
          }
        }
      }
    }
    .presenceSummary {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
      font-size: 13px;
      color: var(--uiTextMuted);
      .presenceDot {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        &::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        &.online::before {
          background: var(--uiStatusSuccess, #22c55e);
          box-shadow: 0 0 6px var(--uiStatusSuccess, #22c55e);
        }
        &.away::before {
          background: var(--uiStatusWarning, #eab308);
        }
        &.offline::before {
          background: var(--uiTextMuted, #71717a);
        }
      }
    }
  }
  .defaultModelsCard {
    margin-top: 36px;
    padding: 20px;
    border: 1px solid var(--uiBorderControl);
    border-radius: var(--uiRadiusCard);
    background: var(--uiSurfaceRaised);
    .defaultModelsHeader {
      margin: 0 0 16px;
    }
    .defaultModelsGrid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
  }
  .modelHeader { margin-top: 36px; }
  .rowActions { display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; }
  .actionGroup { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; flex-wrap: nowrap; }
  .credentialBadge { font-family: var(--uiFontMono, monospace); font-size: 13px; color: var(--uiTextSecondary); letter-spacing: 0.5px; }
  .roleLabel { color: var(--uiTextMuted); }
  .auditDetails { font-size: 12px; overflow-wrap: anywhere; }
  .priceGroup {
    &.disabledPrices { margin-top: 20px; summary { padding: 12px 0; cursor: pointer; color: var(--uiTextMuted); } }
  }
  .priceTable {
    :deep(table) { min-width: 1150px; }
    .priceEditor {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;
      :deep(input) { text-align: center; }
    }
  }
}
.configDetails { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; .priceSummary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uiTextSecondary); font-size: 12px; } }
.sectionHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
.dialogForm { display: grid; gap: 20px; .sectionHint { margin: 0; } .rateFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; } }
.projectList { display: grid; gap: 12px; }
.tierList { display: grid; gap: 12px; .tierHeader, .tierRow { display: grid; grid-template-columns: minmax(0, 1fr) 140px auto; align-items: center; gap: 8px; } .tierHeader { color: var(--uiTextMuted); font-size: 12px; padding: 0 8px; } .tierActions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; :deep(button) { width: 100%; } } }
@media (max-width: 900px) { .adminSection .defaultModelsCard .defaultModelsGrid, .adminSection .usageMetricGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .adminSection .sectionHeader { flex-direction: column; } .adminSection .usageBreakdownGrid { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .adminSection .usageFilterBar { align-items: stretch; flex-direction: column; } .adminSection .usagePrimaryFilter { max-width: none; } .adminSection .usageFilterActions { justify-content: flex-end; } }
@media (max-width: 520px) { .dialogForm .rateFields { grid-template-columns: 1fr; } .adminSection .usageMetricGrid { grid-template-columns: 1fr; } .adminSection .usageChartHeader { flex-direction: column; } .adminSection .usageFilterActions { justify-content: stretch; } .adminSection .usageFilterActions :deep(button) { flex: 1; } .adminSection .usageFiltersDialog { grid-template-columns: 1fr; } }
</style>
