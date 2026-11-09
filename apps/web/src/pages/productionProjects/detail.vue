<template>
  <accountShell :immersive="true" :title="project?.title ?? '生产项目'" eyebrow="漫剧生产工作台" description="按顺序完成剧集、主体资产、分镜脚本和视频交付。">
    <template #actions>
      <uiButton variant="ghost" @click="router.push('/productionProjects')">返回项目列表</uiButton>
      <uiButton variant="secondary" :loading="loading" @click="loadProject">刷新详情</uiButton>
      <uiButton v-if="project && (currentRole === 'owner' || currentRole === 'producer')" variant="secondary" @click="memberVisible = true">项目成员</uiButton>
    </template>

    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <div v-if="loading && !project" class="loadingState">正在读取项目生产数据…</div>
    <template v-else-if="project">
      <section class="projectHero">
        <div><span class="heroKicker">项目编号 · {{ project.id }}</span><p>预算 {{ project.budgetCents }} 积分 · 当前角色：{{ roleLabel(currentRole) }}</p></div>
        <div class="heroStatus"><uiTag :tone="statusTone(project.status)">{{ statusLabel(project.status) }}</uiTag></div>
      </section>

      <nav class="workflowRail" aria-label="漫剧生产步骤"><button v-for="(step, index) in primaryWorkflowSteps" :key="step.stage" type="button" class="workflowStep" :class="{ active: isStepReached(step.stage), current: activeStep === step.stage, locked: !isStepReached(step.stage) }" :aria-current="activeStep === step.stage ? 'step' : undefined" :aria-label="`${step.label}${isStepReached(step.stage) ? '' : `，${stepReason(step.stage)}`}`" :disabled="!isStepReached(step.stage) || loading" :title="stepReason(step.stage)" @click="goStep(step.stage)"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ step.label }}</strong><small>{{ activeStep === step.stage ? '当前步骤' : isStepReached(step.stage) ? '可回看' : '完成前置步骤后开放' }}</small></button></nav>

      <section class="stageFocus" aria-live="polite">
        <div class="stageFocusHeader"><div><span class="stageEyebrow">{{ activeStepIndex }} / 04 · {{ stageMeta[activeStage].eyebrow }}</span><h3>{{ stageMeta[activeStage].label }}</h3><p>{{ stageMeta[activeStage].description }}</p></div><uiTag :tone="activeStepReady ? 'success' : 'warning'">{{ activeStepReady ? '本步骤已具备条件' : '仍有前置事项' }}</uiTag></div>
        <div class="stageStats"><div v-for="item in stageMetricItems" :key="item.label"><strong>{{ item.value }}</strong><span>{{ item.label }}</span></div></div>
        <div v-if="!activeStepReady" class="stageHint">{{ activeStepReason }}</div>
      </section>

      <section v-if="scriptEntryMode" class="scriptComposer" aria-label="剧本创作入口">
        <header class="scriptComposerHeader"><div><span class="panelEyebrow">{{ dramaModeLabel }} · 草稿</span><h3>{{ dramaDraftMode === 'create' ? '由你开场' : dramaModeLabel }}</h3><p>{{ dramaDraftMode === 'create' ? '写下故事梗概，生成剧集、场景、对白和主体资产草案。' : modeDescription }}</p></div><uiTag>{{ scriptAgentLabel }}</uiTag></header>
        <div class="scriptComposerGrid">
          <div class="scriptComposerMain">
            <uiField :label="instructionLabel"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="currentInstruction" :rows="5" resize="vertical" :placeholder="instructionPlaceholder" /></template></uiField>
            <uiField v-if="dramaDraftMode === 'adapt' || dramaDraftMode === 'produce'" :label="dramaDraftMode === 'produce' ? '剧本正文' : '待改编剧本正文（可选）'"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="scriptDraft.body" :rows="10" resize="vertical" placeholder="可直接粘贴剧本正文；上传文件中的 TXT、MD 或 DOCX 正文也会一起作为输入。" /></template></uiField>
            <div class="ideaInputShell">
              <button type="button" class="uploadTile" :aria-label="referenceUploadLabel" @click="scriptReferenceInput?.click()"><icon-plus :size="22" aria-hidden="true" /></button>
              <div class="uploadPrompt"><strong>{{ referenceUploadLabel }}</strong><span>{{ dramaDraftMode === 'redraw' ? '支持 MP4、MOV、WEBM、M4V，最大 500 MB' : '支持 TXT、MD、DOCX，单个文件最大 50 MB' }}</span></div>
              <input ref="scriptReferenceInput" class="hiddenFileInput" type="file" :accept="referenceAccept" multiple @change="handleScriptReference" />
            <div v-if="scriptReferenceFiles.length" class="referenceFileList"><div v-for="file in scriptReferenceFiles" :key="file.id" class="referenceFileChip"><icon-file-text :size="16" aria-hidden="true" /><span>{{ file.name }}</span><small>{{ formatFileSize(file.size) }}</small><uiIconButton size="small" :icon="IconX" :label="`移除 ${file.name}`" @click="removeScriptReference(file)" /></div></div>
            </div>
            <p class="referenceStorageNote">附件仅暂存在此浏览器的本地草稿中，不会上传为团队共享资产；清理浏览器数据会移除这些附件。</p>
          </div>
          <aside class="scriptSettings"><span class="panelEyebrow">创作规格</span><uiField label="风格"><template #default="{ id }"><productionVisualPicker :id="id" v-model="scriptDraft.style" kind="style" block /></template></uiField><uiField label="题材与融合题材"><template #default="{ id }"><productionVisualPicker :id="id" v-model="dramaDraftGenre" v-model:fusionGenres="fusionGenres" kind="genre" block /></template></uiField><uiField label="画面比例"><template #default="{ id }"><uiSelect :id="id" v-model="scriptDraft.aspectRatio" :options="aspectRatioOptions" /></template></uiField><uiField label="目标集数"><template #default="{ id }"><uiNumberInput :id="id" v-model="scriptDraft.episodeCount" :min="1" :max="12" :precision="0" /></template></uiField><uiField v-if="supportsModelScript" label="文本模型"><template #default="{ id }"><uiSelect :id="id" v-model="scriptModelValue" :options="scriptModelOptions" /></template></uiField><uiField v-if="dramaDraftMode === 'adapt'" label="改编方式"><template #default="{ id }"><uiSelect :id="id" v-model="adaptType" :options="adaptTypeOptions" /></template></uiField><uiField v-if="dramaDraftMode === 'redraw'" label="输出语言"><template #default="{ id }"><uiInput :id="id" v-model.trim="outputLanguage" placeholder="中文" /></template></uiField><p v-if="supportsModelScript">每种模式会调用独立任务提示；TXT、MD 和 DOCX 正文会作为参考发送。附件暂存在当前浏览器本地，单次最多 12 集。</p><p v-else>原片转绘需要视频理解与转绘工作流，当前附件仅保存在本地草稿。</p></aside>
        </div>
        <p v-if="scriptError" class="pageError" role="alert">{{ scriptError }}</p>
        <p v-if="scriptGenerationUsage && !scriptPreviewVisible" class="generationUsageNote">本次模型请求已按实际用量结算：{{ scriptGenerationUsage.total }} tokens（输入 {{ scriptGenerationUsage.input }} / 输出 {{ scriptGenerationUsage.output }}）。</p>
        <div v-if="supportsModelScript" class="scriptComposerActions"><uiButton variant="secondary" :loading="scriptQuoting" :disabled="scriptGenerating || scriptQuoting || !canPreviewScript" @click="quoteScriptGeneration">获取费用预估</uiButton><uiButton :loading="scriptGenerating" :disabled="scriptGenerating || scriptQuoting || !canPreviewScript || !scriptQuote" @click="generateScriptOutline">{{ scriptQuote ? `确认生成（预估上限 ${scriptQuote.credits} 积分）` : '先获取费用预估' }}</uiButton></div>
        <p v-else class="workflowPending">原片转绘 Agent 需要视频理解与转绘工作流，当前暂未接入。</p>
        <section v-if="scriptPreviewVisible" class="scriptPreview">
          <div class="scriptPreviewHeader"><div><span class="panelEyebrow">模型生成草案 · 可编辑</span><strong>{{ scriptOutline.length }} 集 · {{ scriptSceneCount }} 场景 · {{ scriptShotCount }} 镜头 · {{ scriptAssets.length }} 项资产</strong></div><span v-if="scriptGenerationUsage">实测 {{ scriptGenerationUsage.total }} tokens</span></div>
          <uiField label="全剧梗概"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="scriptLogline" :rows="3" resize="vertical" /></template></uiField>
          <div class="scriptPreviewList"><article v-for="episode in scriptOutline" :key="episode.episodeNumber" class="scriptPreviewEpisode"><uiField :label="`第 ${episode.episodeNumber} 集标题`"><template #default="{ id }"><uiInput :id="id" v-model.trim="episode.title" /></template></uiField><div v-for="scene in episode.scenes" :key="scene.sceneNumber" class="scriptPreviewScene"><uiField :label="`场景 ${scene.sceneNumber}`"><template #default="{ id }"><uiInput :id="id" v-model.trim="scene.title" /></template></uiField><uiField label="场景与连续性"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="scene.continuityNotes" :rows="2" resize="vertical" /></template></uiField><div v-for="shot in scene.shots" :key="shot.shotNumber" class="scriptPreviewShot"><strong>镜头 {{ shot.shotNumber }} · {{ shot.shotType }}</strong><uiField label="画面提示"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.prompt" :rows="3" resize="vertical" /></template></uiField><uiField label="对白"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.dialogue" :rows="2" resize="vertical" /></template></uiField><uiField label="旁白"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.narration" :rows="2" resize="vertical" /></template></uiField></div></div></article></div>
          <h4>主体资产草案</h4><div class="scriptAssetPreview"><article v-for="(asset, index) in scriptAssets" :key="`${asset.assetType}-${index}`"><strong>{{ asset.assetType === 'character' ? '角色' : asset.assetType === 'scene' ? '场景' : '道具' }}</strong><uiField label="名称"><template #default="{ id }"><uiInput :id="id" v-model.trim="asset.name" /></template></uiField><uiField label="设定"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="asset.description" :rows="2" resize="vertical" /></template></uiField><uiField label="视觉约定"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="asset.visualDescription" :rows="2" resize="vertical" /></template></uiField></article></div>
          <div class="scriptPreviewFooter"><span>确认后一次性写入生产项目；模型任务按实际 token 用量结算。<template v-if="scriptGenerationUsage">本次 {{ scriptGenerationUsage.total }} tokens。</template></span><uiButton size="small" :loading="scriptCreating" :disabled="scriptCreating || !scriptOutline.length" @click="createScriptStructure">确认并进入主体资产</uiButton></div>
        </section>
      </section>

      <section v-if="activeStage === 'scripted' && !scriptEntryMode" class="stageWorkbench scriptWorkbench" aria-label="分镜剧集">
        <aside class="workbenchSidebar">
          <div class="workbenchSidebarHeader"><div><span class="panelEyebrow">剧集目录</span><strong>分集剧本</strong></div><div class="sidebarHeaderActions"><uiButton v-if="canEditEpisodes" size="small" variant="secondary" @click="episodeVisible = true">添加</uiButton></div></div>
          <div class="episodeNavList"><button v-for="episode in project.episodes" :key="episode.id" type="button" class="episodeNavItem scriptEpisodeItem" :class="{ selected: episode.id === activeEpisodeId }" @click="activeEpisodeId = episode.id"><span class="episodeNavIndex">EP {{ String(episode.episodeNumber).padStart(2, '0') }}</span><span class="episodeNavCopy"><strong>{{ episode.title }}</strong><small>{{ episodeSceneCount(episode.id) }} 场 · {{ episodeShotCount(episode.id) }} 镜头</small></span><uiTag :tone="episodeShotCount(episode.id) ? 'success' : 'warning'">{{ episodeShotCount(episode.id) ? '已保存' : '待完善' }}</uiTag></button><div v-if="!project.episodes.length" class="workbenchEmpty">尚未创建剧集</div></div>
        </aside>
        <div class="stageWorkspace scriptReadingPane">
          <header class="workspaceHeader"><div><span class="panelEyebrow">01 / 剧集结构</span><h3>{{ activeEpisode?.title || '选择剧集' }}</h3><p v-if="activeEpisode">目标时长 {{ Math.round(activeEpisode.targetDurationMs / 1000) }} 秒 · {{ activeEpisodeSceneCount }} 场景 · {{ activeEpisodeShots.length }} 镜头</p></div></header>
          <div v-if="activeEpisodeShots.length" class="episodeScriptContent"><article v-for="scene in scriptScenesForEpisode(activeEpisodeId)" :key="scene.id" class="episodeScriptScene"><span>场 {{ String(scene.sceneNumber).padStart(2, '0') }} · {{ scene.title }}</span><p v-if="scene.continuityNotes">连续性：{{ scene.continuityNotes }}</p><div v-for="shot in scene.shots" :key="shot.id" class="episodeScriptShot"><strong>镜头 {{ String(shot.shotNumber).padStart(2, '0') }}</strong><p>{{ shot.prompt || '尚未填写画面内容' }}</p><p v-if="shot.dialogue">对白：{{ shot.dialogue }}</p><p v-if="shot.narration">旁白：{{ shot.narration }}</p></div></article><p class="scriptRecordNote">当前展示的是项目已保存的场景和镜头文本，完整剧本正文版本管理尚未接入。</p></div>
          <div v-else class="stageEmpty"><strong>{{ activeEpisode ? '这一集还没有可展示的剧本文本' : '尚未创建剧集' }}</strong><span>创建剧集后，在分集列表中选择一集查看已保存内容。</span><uiButton v-if="canEditEpisodes" size="small" variant="secondary" @click="episodeVisible = true">添加剧集</uiButton></div>
          <div class="stageFooter"><span>{{ activeStepReason }}</span><uiButton :disabled="!isStepReached('assets')" @click="goStep('assets')">下一步：主体资产</uiButton></div>
        </div>
      </section>

      <section v-if="activeStage === 'assets'" class="stageSheet assetWorkspace" aria-label="主体资产">
        <header class="stageSheetHeader"><div><span class="panelEyebrow">02 / 主体一致性</span><h3>主体资产</h3><p>登记角色、场景与道具的设定，作为全剧分镜与生成阶段共同引用的一致性资料。</p></div><uiButton v-if="canManageAssets" size="small" @click="openAssetForm()">新增资产</uiButton></header>
        <div class="assetTypeTabs" role="tablist" aria-label="主体资产类别"><button v-for="item in assetTypeOptions" :key="item.value" type="button" role="tab" :aria-selected="activeAssetType === item.value" :class="{ active: activeAssetType === item.value }" @click="activeAssetType = item.value">{{ item.label }}<span>{{ project.assets.filter(asset => asset.assetType === item.value).length }}</span></button></div>
        <div v-if="filteredAssets.length" class="assetRecordList"><article v-for="asset in filteredAssets" :key="asset.id" class="assetRecord" tabindex="0" @click="openAssetDetail(asset)" @keydown.enter="openAssetDetail(asset)"><div class="assetRecordVisual"><img v-if="assetPreviewUrls[asset.id]" :src="assetPreviewUrls[asset.id]" :alt="`${asset.name}参考图`" /><div v-else class="assetRecordPlaceholder"><span>{{ asset.referenceStatus === 'generating' ? '生成中' : asset.referenceStatus === 'failed' ? '生成失败' : '未生成' }}</span><small>点击查看详情</small></div></div><div class="assetRecordCopy"><strong>{{ asset.name }}</strong><p>{{ asset.description || '未填写设定说明' }}</p><small>{{ asset.visualDescription || '未填写视觉设定' }}</small></div><div class="assetRecordFooter"><span class="assetScope">{{ asset.episodeIds.length ? assetEpisodeLabel(asset.episodeIds) : '全剧适用' }}</span><div class="assetCardActions"><uiTag :tone="asset.referenceStatus === 'succeeded' ? 'success' : asset.referenceStatus === 'failed' ? 'error' : 'neutral'">{{ asset.referenceStatus === 'succeeded' ? '已生成' : asset.referenceStatus === 'generating' ? '生成中' : '待生成' }}</uiTag><uiButton size="small" variant="ghost" :disabled="!canManageAssets" @click.stop="openAssetForm(asset)">编辑</uiButton></div></div></article></div>
        <div v-else class="stageEmpty"><strong>该分类还没有主体资产</strong><span>{{ canManageAssets ? '先登记项目角色、场景或关键道具，再进入分镜脚本。' : '当前角色没有编辑权限。' }}</span><uiButton v-if="canManageAssets" size="small" variant="secondary" @click="openAssetForm()">新增{{ assetTypeLabel(activeAssetType) }}</uiButton></div>
        <p class="assetCapabilityNote">点击资产卡片查看完整设定并生成参考图。生成前会显示积分预估，图片会写入项目工作区并用于后续分镜提示词。</p>
        <div class="stageFooter"><span>{{ assetReadinessText }}</span><uiButton :disabled="!isStepReached('storyboarded')" :title="stepReason('storyboarded')" @click="goStep('storyboarded')">下一步：分镜脚本</uiButton></div>
      </section>

      <section v-if="activeStage === 'storyboarded' || isVideoStage" class="stageWorkbench" :class="{ videoWorkbench: isVideoStage, storyboardWorkbench: activeStage === 'storyboarded' }" aria-label="阶段工作台">
        <aside v-if="activeStage === 'storyboarded'" class="workbenchSidebar">
          <div class="workbenchSidebarHeader"><div><span class="panelEyebrow">分镜目录</span><strong>剧集</strong></div><div class="sidebarHeaderActions"><uiTag>{{ project.episodes.length }} 集</uiTag></div></div>
          <div class="episodeNavList">
            <button v-for="episode in project.episodes" :key="episode.id" type="button" class="episodeNavItem" :class="{ selected: episode.id === activeEpisodeId }" @click="activeEpisodeId = episode.id">
              <span class="episodeNavIndex">EP {{ String(episode.episodeNumber).padStart(2, '0') }}</span><span class="episodeNavCopy"><strong>{{ episode.title }}</strong><small>{{ episodeShotCount(episode.id) }} 镜头 · {{ episodeSceneCount(episode.id) }} 场景</small></span><uiTag :tone="episodeShotCount(episode.id) ? 'success' : 'neutral'">{{ episodeShotCount(episode.id) ? '已拆镜' : '待拆镜' }}</uiTag>
            </button>
            <div v-if="!project.episodes.length" class="workbenchEmpty">尚未创建剧集</div>
          </div>
          <div class="assetNav"><div class="assetNavTitle">项目主体资产</div><div v-for="item in assetTypeOptions" :key="item.value" class="assetNavItem"><span>{{ item.label }}</span><strong>{{ project.assets.filter(asset => asset.assetType === item.value).length }}</strong></div></div>
        </aside>

        <div class="stageWorkspace">
          <header class="workspaceHeader"><div><span class="panelEyebrow">{{ stageMeta[activeStage].eyebrow }}</span><h3>{{ activeEpisode?.title || (isVideoStage ? '全剧生成队列' : '未选择剧集') }}</h3></div><div v-if="isVideoStage" class="workspaceHeaderMeta"><uiSelect v-model="activeEpisodeId" :options="episodeOptions" /><span>{{ activeEpisodeShots.length }} 个镜头</span></div><div v-else class="workspaceHeaderMeta"><span>{{ activeEpisodeShots.length }} 个镜头</span><span>{{ activeEpisodeSceneCount }} 个场景</span></div></header>

          <div v-if="activeStage === 'storyboarded'" class="storyboardWorkspace">
            <div class="storyboardToolbar"><div><strong>分镜脚本</strong><span>核对每集完整性、镜头景别、时长和生成画面描述</span></div><div class="storyboardToolbarActions"><uiButton v-if="canAdd" size="small" variant="secondary" :disabled="busy || !activeEpisodeId || videoProductionStarted" @click="openShotForm(activeEpisodeId)">添加镜头</uiButton><uiButton v-if="canEdit" size="small" :disabled="busy || !assetsReady || !storyboardReady || videoProductionStarted" :title="stepReason('generating')" @click="advanceToVideo">{{ videoProductionStarted ? '分镜已确认' : '确认分镜并进入视频生成' }}</uiButton></div></div>
            <div v-if="!storyboardReady" class="readinessCallout"><strong>分镜检查未通过</strong><span>{{ storyboardMissingItems.join('；') }}。</span></div>
            <div v-if="!activeEpisodeShots.length" class="workbenchEmpty large">当前剧集还没有镜头，请先添加剧集和镜头。</div>
            <div v-else class="storyboardTable" role="table" aria-label="分镜脚本表">
              <div class="storyboardTableHeader" role="row"><span>镜头</span><span>画面 / 景别</span><span>动作 / 台词</span><span>光影 / 机控</span><span>状态</span><span>操作</span></div>
              <article v-for="shot in activeEpisodeShots" :key="shot.id" class="storyboardTableRow" role="row"><div class="storyboardShotNo"><strong>{{ String(shot.shotNumber).padStart(2, '0') }}</strong><small>{{ shot.durationMs / 1000 }} 秒</small></div><div><strong>{{ sceneTitleForShot(shot) }}</strong><small>{{ shot.shotType || '待补景别' }}</small></div><div class="storyboardPrompt"><strong>{{ shot.prompt || '未填写画面描述' }}</strong><small>{{ shot.dialogue || shot.narration || '暂无台词 / 旁白' }}</small></div><div class="storyboardDirection"><strong>{{ shot.lighting || '自然光' }}</strong><small>{{ shot.camera || '未设镜头控制' }}</small></div><uiTag :tone="shotTone(shot.status)">{{ shotStatusLabel(shot.status) }}</uiTag><div class="storyboardActions"><uiButton v-if="canEditStoryboard" size="small" variant="secondary" :disabled="busy || videoProductionStarted" @click="openShotForm(activeEpisodeId, shot)">编辑</uiButton></div></article>
            </div>
          </div>

          <nav v-if="isVideoStage" class="videoTaskTabs" aria-label="视频生产子步骤"><button v-for="item in videoTaskTabs" :key="item.stage" type="button" :aria-current="activeStage === item.stage ? 'step' : undefined" :class="{ active: activeStage === item.stage }" :disabled="!isVideoTaskReached(item.stage)" :title="isVideoTaskReached(item.stage) ? item.label : item.stage === 'review' ? '生成候选后开放审片' : item.stage === 'approved' ? '全剧镜头批准后开放' : '全剧批准并完成交付检查后开放'" @click="goVideoTask(item.stage)">{{ item.label }}<small>{{ item.count }}</small></button></nav>

          <div v-if="activeStage === 'generating'" class="generationWorkspace">
            <div class="workspaceCallout"><div><span class="panelEyebrow">生成队列 · 第 {{ activeEpisode?.episodeNumber ?? '—' }} 集</span><strong>{{ pendingGenerationCount }} 个镜头等待提交</strong><p>每次只提交当前剧集的一个镜头。预算、权限与任务结果会写入项目记录。</p></div><div class="generationActions"><uiButton v-if="generationShot" :disabled="!canGenerate || busy" @click="selectShotForGeneration(generationShot)">配置下一镜头</uiButton><uiButton v-if="activeEpisodeVariants.length && canDeliverCut" variant="secondary" @click="openEditorForEpisode">剪辑本集候选</uiButton></div></div>
            <div class="queueList"><article v-for="shot in activeEpisodeShots" :key="shot.id" class="queueRow"><span class="queueIndex">{{ String(shot.shotNumber).padStart(2, '0') }}</span><div><strong>{{ sceneTitleForShot(shot) }}</strong><small>{{ shot.prompt || '未填写提示词' }}</small></div><uiTag :tone="shotTone(shot.status)">{{ shotStatusLabel(shot.status) }}</uiTag><uiButton v-if="['draft', 'ready', 'changesRequested'].includes(shot.status)" size="small" variant="ghost" :disabled="!canGenerate || busy" @click="selectShotForGeneration(shot)">配置生成</uiButton></article><div v-if="!activeEpisodeShots.length" class="workbenchEmpty">当前剧集没有镜头</div></div>
          </div>

          <div v-else-if="activeStage === 'review'" class="reviewWorkspace"><div class="workspaceCallout"><div><span class="panelEyebrow">候选审片</span><strong>{{ reviewShot ? `镜头 ${String(reviewShot.shotNumber).padStart(2, '0')} 等待决策` : '当前没有待审片镜头' }}</strong><p>选择候选片段后可记录意见、退回重拍或批准版本。</p></div><uiButton v-if="reviewShot && canReview" variant="secondary" :disabled="busy" @click="selectShotForReview(reviewShot)">打开审片</uiButton></div><div class="candidateStrip"><div v-for="variant in project?.variants.filter(item => activeEpisodeShots.some(shot => shot.id === item.shotId)).slice(0, 6) ?? []" :key="variant.id" class="candidateCard"><div class="candidateThumb"><span>候选 {{ variant.attemptNumber }}</span><b>{{ variant.mimeType.split('/')[0] }}</b></div><strong>{{ variant.filePath.split('/').pop() }}</strong><small>{{ variant.status }}</small></div><div v-if="!activeEpisodeShots.some(shot => project?.variants.some(item => item.shotId === shot.id))" class="workbenchEmpty">当前剧集生成候选后会出现在这里</div></div></div>

          <div v-else-if="activeStage === 'approved'" class="approvalWorkspace"><div class="approvalBanner"><span class="approvalMark">✓</span><div><strong>版本批准检查 · 第 {{ activeEpisode?.episodeNumber ?? '—' }} 集</strong><p>逐镜确认当前集候选状态。所有剧集的镜头都批准后才能导出交付包。</p></div><uiTag :tone="allShotsApproved ? 'success' : 'warning'">{{ allShotsApproved ? '满足交付条件' : '仍需处理' }}</uiTag></div><div class="approvalChecklist"><div v-for="shot in activeEpisodeShots" :key="shot.id"><span :class="{ done: shot.status === 'approved' }">{{ shot.status === 'approved' ? '✓' : '·' }}</span><strong>镜头 {{ String(shot.shotNumber).padStart(2, '0') }}</strong><small>{{ shot.status === 'approved' ? '已锁定批准版本' : '等待批准或重拍' }}</small><uiButton v-if="shot.status === 'review' && canReview" size="small" variant="secondary" :disabled="busy" @click="selectShotForReview(shot)">审片</uiButton></div><div v-if="!activeEpisodeShots.length" class="workbenchEmpty">当前剧集没有镜头</div></div></div>

          <div v-else-if="activeStage === 'delivered'" class="deliveryWorkspace"><div class="deliveryBanner"><span class="approvalMark">↗</span><div><strong>交付证据已归档</strong><p>交付包包含 MP4、SRT、manifest 和审计包，可从右侧记录下载。</p></div><uiTag tone="success">{{ project.deliveries.length ? '已交付' : '待交付' }}</uiTag></div><div class="deliveryFacts"><div><strong>{{ project.deliveries.length ? 4 : 0 }}</strong><span>交付文件</span></div><div><strong>{{ project.deliveries.length }}</strong><span>交付批次</span></div><div><strong>{{ project.deliveries.length ? 'SHA-256' : '—' }}</strong><span>版本证据</span></div></div></div>

          <div v-if="activeStage === 'delivered'" class="deliveryRecords"><div class="deliveryActions"><span>{{ project.deliveries.length ? '交付文件已生成，可逐项下载。' : allShotsApproved ? '所有镜头已批准，可导出 MP4、SRT、manifest 和审计包。' : `尚有 ${project.shots.filter(shot => shot.status !== 'approved').length} 个镜头未批准。` }}</span><uiButton :disabled="!canExport || !allShotsApproved" :loading="exporting" @click="exportDelivery">{{ project.deliveries.length ? '已生成交付包' : '导出交付包' }}</uiButton></div><div v-if="!project.deliveries.length" class="stageEmpty"><strong>尚未生成交付包</strong><span>导出前会检查所有剧集的批准状态，并记录 manifest 哈希与审计凭证。</span></div><article v-for="delivery in project.deliveries" :key="delivery.id" class="deliveryItem"><div><strong>{{ delivery.createdAt }}</strong><span>交付 {{ delivery.status }} · SHA-256 {{ delivery.manifestHash }}</span></div><div class="deliveryFiles"><uiButton v-for="file in deliveryFiles(delivery)" :key="file.path" size="small" variant="ghost" :disabled="downloadingPath === file.path" :loading="downloadingPath === file.path" @click="downloadDeliveryFile(file.path)">{{ file.label }}</uiButton></div></article></div>
        </div>

        <aside v-if="isVideoStage" class="previewPanel"><div class="previewPanelHeader"><div><span class="panelEyebrow">{{ activeStage === 'review' ? '审片预览' : '候选预览' }}</span><strong>{{ activeStage === 'delivered' ? '交付版本' : '当前候选' }}</strong></div><uiTag>{{ project.variants.length }} 候选</uiTag></div><div v-if="variantUrl && previewVariant" class="previewMedia"><video v-if="previewVariant.mimeType.startsWith('video/')" :src="variantUrl" controls preload="metadata" /><audio v-else-if="previewVariant.mimeType.startsWith('audio/')" :src="variantUrl" controls preload="metadata" /><img v-else-if="previewVariant.mimeType.startsWith('image/')" :src="variantUrl" alt="候选片段预览" /><span>{{ previewVariant.filePath }}</span></div><div v-else class="previewFrame"><div class="previewGlyph">{{ activeStage === 'delivered' ? '↗' : activeStage === 'review' ? '▶' : '◌' }}</div><strong>{{ activeStage === 'review' && reviewShot ? `镜头 ${reviewShot.shotNumber}` : '尚未选择片段' }}</strong><span>{{ project.variants.length ? '选择候选片段加载预览' : '生成候选后显示预览' }}</span></div><div class="previewFooter"><span>当前候选</span><strong>{{ previewVariant ? `#${previewVariant.attemptNumber}` : '—' }}</strong><uiButton v-if="reviewShot" size="small" variant="ghost" :disabled="busy" @click="selectShotForReview(reviewShot)">打开审片</uiButton></div></aside>
      </section>

      <section v-if="isVideoStage" class="candidateDock" aria-label="生成候选片段"><div class="candidateDockHeader"><div><span class="panelEyebrow">生成结果</span><strong>候选片段</strong></div><div class="candidateDockActions"><span>{{ project.variants.length }} 个版本</span><uiButton v-if="previewVariant && canDeliverCut" size="small" variant="secondary" @click="openEditorForVariant(previewVariant)">剪辑所选候选</uiButton></div></div><div class="candidateDockList"><button v-for="variant in project.variants" :key="variant.id" type="button" class="candidateCard" :class="{ selected: variant.id === previewVariant?.id }" @click="selectVariantPreview(variant)"><div class="candidateThumb"><span>片段 {{ String(variant.attemptNumber).padStart(2, '0') }}</span><b>{{ variant.mediaType }}</b></div><strong>{{ variant.filePath.split('/').pop() }}</strong><small>{{ variant.status }} · {{ variant.mimeType }}</small></button><div v-if="!project.variants.length" class="workbenchEmpty">生成候选后会出现在这里</div></div></section>
      <productionCutPanel :key="project.id" :projectId="project.id" :episodes="project.episodes" :canReview="canReview" :canApprove="canApprove" :canDeliver="canDeliverCut" :refreshKey="projectRefreshKey" />
    </template>

    <productionMemberPanel v-if="project" v-model="memberVisible" :projectId="project.id" :currentUserId="currentUserId" :currentRole="currentRole" :refreshKey="projectRefreshKey" @changed="loadProject" />

    <uiDialog v-model="episodeVisible" title="添加剧集" :width="500">
      <form class="dialogForm" @submit.prevent="submitEpisode"><uiField label="季编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="episodeForm.seasonNumber" :min="1" :precision="0" /></template></uiField><uiField label="季名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="episodeForm.seasonTitle" /></template></uiField><uiField label="集编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="episodeForm.episodeNumber" :min="1" :precision="0" /></template></uiField><uiField label="集名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="episodeForm.title" /></template></uiField><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="episodeVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !episodeForm.title">创建剧集</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="shotVisible" title="添加镜头" :width="560">
      <form class="dialogForm" @submit.prevent="submitShot"><uiField v-if="!editingShot" label="场景编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="shotForm.sceneNumber" :min="1" :precision="0" /></template></uiField><uiField label="场景名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="shotForm.sceneTitle" :disabled="Boolean(editingShot)" /></template></uiField><uiField label="镜头编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="shotForm.shotNumber" :min="1" :precision="0" :disabled="Boolean(editingShot)" /></template></uiField><uiField label="时长（毫秒）"><template #default="{ id }"><uiNumberInput :id="id" v-model="shotForm.durationMs" :min="0" :precision="0" /></template></uiField><uiField label="景别"><template #default="{ id }"><uiInput :id="id" v-model.trim="shotForm.shotType" placeholder="远景 / 中景 / 特写" /></template></uiField><uiField label="镜头控制"><template #default="{ id }"><uiInput :id="id" v-model.trim="shotForm.camera" placeholder="运镜、方向、速度和机位" /></template></uiField><uiField label="光影"><template #default="{ id }"><uiInput :id="id" v-model.trim="shotForm.lighting" /></template></uiField><uiField label="画面描述 / 生成提示词" required><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shotForm.prompt" :rows="4" resize="vertical" placeholder="描述角色、场景、动作和画面变化" /></template></uiField><uiField label="对白"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shotForm.dialogue" :rows="2" resize="vertical" /></template></uiField><uiField label="旁白"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shotForm.narration" :rows="2" resize="vertical" /></template></uiField><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="shotVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !shotForm.sceneTitle || !shotForm.prompt">{{ editingShot ? '保存分镜' : '创建镜头' }}</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="assetVisible" :title="editingAsset ? '编辑主体资产' : `新增${assetTypeLabel(assetForm.assetType)}`" :width="560">
      <form class="dialogForm" @submit.prevent="submitAsset"><uiField label="资产类别" required><template #default="{ id }"><uiSelect :id="id" v-model="assetForm.assetType" :options="assetTypeOptions" /></template></uiField><uiField label="名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="assetForm.name" maxlength="200" /></template></uiField><uiField label="设定说明"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="assetForm.description" :rows="3" resize="vertical" maxlength="4000" placeholder="角色身份、场景功能或道具剧情用途" /></template></uiField><uiField label="视觉设定" required><template #default="{ id }"><uiTextarea :id="id" v-model.trim="assetForm.visualDescription" :rows="4" resize="vertical" maxlength="4000" placeholder="外观、服饰、色彩、材质与需要保持一致的特征" /></template></uiField><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="assetVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !assetForm.name.trim() || !assetForm.visualDescription.trim()">{{ editingAsset ? '保存修改' : '保存资产' }}</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="assetDetailVisible" title="主体资产参考图" :width="1080" @closed="closeAssetDetail">
      <div v-if="selectedAsset" class="assetDetailLayout">
        <aside class="assetDetailList"><div class="assetDetailListHeader"><span class="panelEyebrow">项目资产</span><strong>{{ project?.assets.length ?? 0 }} 项</strong></div><button v-for="asset in project?.assets ?? []" :key="asset.id" type="button" class="assetDetailListItem" :class="{ active: asset.id === selectedAsset.id }" @click="openAssetDetail(asset)"><div class="assetDetailMini"><img v-if="assetPreviewUrls[asset.id]" :src="assetPreviewUrls[asset.id]" :alt="`${asset.name}缩略图`" /><span v-else>{{ assetTypeLabel(asset.assetType).slice(0, 1) }}</span></div><span><strong>{{ asset.name }}</strong><small>{{ assetTypeLabel(asset.assetType) }}</small></span></button></aside>
        <section class="assetDetailBody"><header><span class="panelEyebrow">{{ assetTypeLabel(selectedAsset.assetType) }} · 第 {{ selectedAsset.referenceRevision || 0 }} 版参考图</span><h3>{{ selectedAsset.name }}</h3><p>{{ selectedAsset.description || '暂无设定说明' }}</p></header><div class="assetDetailFields"><div><span>视觉设定</span><p>{{ selectedAsset.visualDescription || '暂无视觉设定' }}</p></div><div><span>最终提示词</span><p>{{ assetImageFinalPrompt }}</p></div></div><div class="assetDetailSettings"><uiField label="图片模型"><template #default="{ id }"><uiSelect :id="id" v-model="assetImageModelValue" :options="assetImageModelOptions" /></template></uiField><uiField label="尺寸"><template #default="{ id }"><uiSelect :id="id" v-model="assetImageSize" :options="assetImageSizeOptions" /></template></uiField></div><uiField label="生成补充提示词"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="assetImagePrompt" :rows="4" resize="vertical" placeholder="补充姿态、构图、镜头和背景要求" /></template></uiField><p v-if="assetImageQuote" class="assetImageQuote">预计消耗 <strong>{{ assetImageQuote }}</strong> 积分；确认后才会提交生成。</p><p v-if="assetImageError" class="pageError">{{ assetImageError }}</p><div class="assetDetailActions"><uiButton variant="secondary" :disabled="assetImageBusy || !selectedAsset" @click="quoteAssetImage">{{ assetImageQuote ? '重新获取预估' : '获取积分预估' }}</uiButton><uiButton :loading="assetImageBusy" :disabled="assetImageBusy || !assetImageQuote || !assetImageModelValue" @click="submitAssetImage">{{ selectedAsset.referenceStatus === 'succeeded' ? '确认重新生成' : '确认生成参考图' }}</uiButton></div></section>
        <aside class="assetDetailPreview"><div class="assetDetailPreviewHeader"><span class="panelEyebrow">参考图预览</span><uiTag :tone="selectedAsset.referenceStatus === 'succeeded' ? 'success' : 'neutral'">{{ selectedAsset.referenceStatus === 'succeeded' ? '已保存' : '未生成' }}</uiTag></div><div v-if="assetPreviewUrls[selectedAsset.id]" class="assetDetailImage"><img :src="assetPreviewUrls[selectedAsset.id]" :alt="`${selectedAsset.name}参考图`" /></div><div v-else class="assetDetailEmpty"><span>{{ selectedAsset.referenceStatus === 'generating' ? '正在生成' : '暂无参考图' }}</span><small>生成后会在这里预览</small></div><small v-if="selectedAsset.referencePath" class="assetDetailPath">{{ selectedAsset.referencePath }}</small></aside>
      </div>
    </uiDialog>
    <uiDialog v-model="generateVisible" title="提交镜头生成" :width="560">
      <form class="dialogForm" @submit.prevent="submitGeneration"><uiField label="供应商 ID" required><template #default="{ id }"><uiInput :id="id" v-model.trim="generationForm.providerId" placeholder="例如 baiduVideoFire" /></template></uiField><uiField label="模型 ID" required><template #default="{ id }"><uiInput :id="id" v-model.trim="generationForm.modelId" placeholder="例如 S2.0-Mini" /></template></uiField><uiField label="工作目录" required><template #default="{ id }"><uiInput :id="id" v-model.trim="generationForm.directory" :placeholder="auth.personalDirectory" /></template></uiField><uiField label="媒体类型"><template #default="{ id }"><uiSelect :id="id" :modelValue="generationForm.mediaType" :options="mediaOptions" @update:modelValue="value => typeof value === 'string' && (generationForm.mediaType = value as 'image' | 'video' | 'audio')" /></template></uiField><uiField v-if="generationForm.mediaType === 'video'" label="视频分辨率" required><template #default="{ id }"><uiSelect :id="id" v-model="generationForm.resolution" :options="resolutionOptions" /></template></uiField><uiField label="生成提示词" required><template #default="{ id }"><uiTextarea :id="id" v-model.trim="generationForm.prompt" :rows="4" resize="vertical" /></template></uiField><p class="sectionHint">提交前会再次校验项目权限、预算和幂等键；真实供应商生成会消耗积分。</p><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="generateVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !generationForm.providerId || !generationForm.modelId || !generationForm.prompt || (generationForm.mediaType === 'video' && !generationForm.resolution)">提交生成</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="reviewVisible" title="候选片段审片" :width="620" @closed="closeReview">
      <div v-if="selectedShot" class="reviewPanel"><div class="reviewMeta"><span>镜头 {{ selectedShot.shotNumber }}</span><uiTag tone="warning">待审片</uiTag></div><p class="reviewPrompt">{{ selectedShot.prompt }}</p><div v-if="selectedVariant" class="variantBox"><strong>候选 {{ selectedVariant.attemptNumber }}</strong><span>{{ selectedVariant.filePath }}</span><video v-if="variantUrl && selectedVariant.mimeType.startsWith('video/')" class="variantPreview" :src="variantUrl" controls preload="metadata" /><audio v-else-if="variantUrl && selectedVariant.mimeType.startsWith('audio/')" class="variantPreview" :src="variantUrl" controls preload="metadata" /><img v-else-if="variantUrl && selectedVariant.mimeType.startsWith('image/')" class="variantPreview" :src="variantUrl" alt="候选片段预览" /></div><uiTextarea v-model="reviewComment" :rows="3" resize="vertical" placeholder="填写审片意见，可用于退回重拍或留档" /><div class="dialogActions"><uiButton variant="secondary" :disabled="busy" @click="submitDecision('changesRequested')">退回重拍</uiButton><uiButton :loading="busy" :disabled="busy" @click="submitDecision('approved')">批准候选</uiButton></div></div>
    </uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import { IconX } from "@tabler/icons-vue";
import { unzipSync } from "fflate";
import { uiButton, uiDialog, uiField, uiIconButton, uiInput, uiNumberInput, uiSelect, uiTag, uiTextarea } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import productionVisualPicker from "@/components/account/productionVisualPicker.vue";
import { findProductionGenre } from "@/lib/productionGenres";
import { useAuthStore } from "@/stores/auth";
import { getSessionSnapshot } from "@/lib/sessionState";
import { usePlatformModelsStore } from "@/stores/platformModels";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { readProductionDraft, readProductionDraftFile, removeProductionDraftFile, saveProductionDraft, saveProductionDraftFile, type ProductionDramaDraft, type ProductionDramaDraftMode, type ProductionDraftFileRef, type ProductionDraftGeneration } from "@/lib/productionDraft";
import { defaultProductionStyle, findProductionStyle } from "@/lib/productionStyles";
import productionCutPanel from "./productionCutPanel.vue";
import productionMemberPanel from "./productionMemberPanel.vue";

type ProjectStatus = "draft" | "scripted" | "storyboarded" | "generating" | "editing" | "review" | "approved" | "delivered";
type ShotStatus = "draft" | "ready" | "generating" | "review" | "changesRequested" | "approved";
type AssetType = "character" | "scene" | "prop";
type Episode = { id: string; seasonId: string; episodeNumber: number; title: string; status: string; targetDurationMs: number };
type Shot = { id: string; sceneId: string; shotNumber: number; durationMs: number; shotType: string | null; camera: string | null; lighting: string | null; dialogue: string | null; narration: string | null; prompt: string | null; status: ShotStatus; revision: number };
type ProductionAsset = { id: string; assetType: AssetType; name: string; description: string | null; visualDescription: string | null; episodeIds: string[]; referencePath: string | null; referenceMimeType: string | null; referencePrompt: string | null; referenceGenerationJobId: string | null; referenceStatus: "none" | "generating" | "succeeded" | "failed"; referenceRevision: number };
type Variant = { id: string; shotId: string; attemptNumber: number; filePath: string; mimeType: string; mediaType: string; status: string };
type ProjectRole = "owner" | "producer" | "writer" | "director" | "artist" | "editor" | "reviewer" | "viewer";
type Member = { id: string; userId: string; displayName: string | null; email: string; role: ProjectRole; status: string };
type Delivery = { id: string; status: string; mp4Path: string; srtPath: string; manifestPath: string; auditPackagePath: string; manifestHash: string; createdAt: string };
type Project = { id: string; workspaceId: string; title: string; status: ProjectStatus; budgetCents: string; creativeSettings: { genre: string; fusionGenres: string[]; style: string; aspectRatio: string; stylePrompt?: string; styleNegativePrompt?: string } | null; members: Member[]; seasons: unknown[]; episodes: Episode[]; scenes: unknown[]; shots: Shot[]; assets: ProductionAsset[]; variants: Variant[]; reviews: unknown[]; approvals: unknown[]; deliveries: Delivery[] };
type ProjectPayload = { project: Omit<Project, "members" | "seasons" | "episodes" | "scenes" | "shots" | "assets" | "variants" | "reviews" | "approvals" | "deliveries">; members: Member[]; seasons: unknown[]; episodes: Episode[]; scenes: unknown[]; shots: Shot[]; assets: ProductionAsset[]; variants: Variant[]; reviews: unknown[]; approvals: unknown[]; deliveries: Delivery[] };
type ApiResponse<T> = { code: number; data: T; message: string };
type StageKey = "draft" | "scripted" | "assets" | "storyboarded" | "generating" | "review" | "approved" | "delivered";
type ProductionStep = "scripted" | "assets" | "storyboarded" | "generating";
type StageMetric = { label: string; value: string | number };
type ScriptOutlineShot = { shotNumber: number; durationMs: number; shotType: string; camera: string; lighting: string; prompt: string; dialogue: string; narration: string };
type ScriptOutlineScene = { sceneNumber: number; title: string; continuityNotes: string; shots: ScriptOutlineShot[] };
type ScriptOutlineEpisode = { episodeNumber: number; title: string; targetDurationMs: number; scenes: ScriptOutlineScene[] };
type ScriptOutlineAsset = { assetType: AssetType; name: string; description: string; visualDescription: string };
type ScriptGenerationQuote = { credits: string; textBudget?: { input: number; output: number } };
type ScriptGenerationResult = { logline: string; episodes: ScriptOutlineEpisode[]; assets: ScriptOutlineAsset[] };
type ParsedScriptGeneration = { result: ScriptGenerationResult; repaired: boolean };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const platformModels = usePlatformModelsStore();
const project = ref<Project>();
const projectRefreshKey = ref(0);
const memberVisible = ref(false);
const loading = ref(false);
const busy = ref(false);
const exporting = ref(false);
const downloadingPath = ref("");
const errorMessage = ref("");
const dialogError = ref("");
const episodeVisible = ref(false);
const shotVisible = ref(false);
const assetVisible = ref(false);
const assetDetailVisible = ref(false);
const generateVisible = ref(false);
const reviewVisible = ref(false);
const selectedEpisodeId = ref("");
const activeEpisodeId = ref("");
const editingShot = ref<Shot>();
const activeAssetType = ref<AssetType>("character");
const editingAsset = ref<ProductionAsset>();
const selectedAsset = ref<ProductionAsset>();
const assetImageModelValue = ref("");
const assetImageSize = ref("1K");
const assetImagePrompt = ref("");
const assetImageQuote = ref("");
const assetImageBusy = ref(false);
const assetImageError = ref("");
const assetPreviewUrls = reactive<Record<string, string>>({});
const assetPreviewReleases = new Map<string, () => void>();
const defaultAssetImageSupplement = "生成一张用于漫剧全片一致性参考的主体设定图，主体清晰完整，背景简洁，避免文字和水印。";
const selectedShot = ref<Shot>();
const selectedVariant = ref<Variant>();
const variantUrl = ref("");
const reviewComment = ref("");
const dramaDraftMode = ref<ProductionDramaDraftMode>("create");
const dramaDraftInstruction = ref("");
const dramaDraftGenre = ref("都市爽文逆袭");
const fusionGenres = ref<string[]>([]);
const adaptType = ref("");
const outputLanguage = ref("中文");
const draftReady = ref(false);
let restoringDraft = false;
const scriptReferenceFiles = ref<ProductionDraftFileRef[]>([]);
const scriptReferenceInput = ref<HTMLInputElement>();
const scriptPreviewVisible = ref(false);
const scriptCreating = ref(false);
const scriptGenerating = ref(false);
const scriptQuoting = ref(false);
const scriptError = ref("");
const scriptModelValue = ref("");
const scriptQuote = ref<ScriptGenerationQuote | null>(null);
const scriptLogline = ref("");
const scriptOutline = ref<ScriptOutlineEpisode[]>([]);
const scriptAssets = ref<ScriptOutlineAsset[]>([]);
const scriptGenerationUsage = ref<{ input: number; output: number; total: number; cost: number } | null>(null);
const scriptGenerationData = ref<ProductionDraftGeneration | null>(null);
const scriptReferenceText = ref("");
let variantRelease: (() => void) | undefined;
const episodeForm = reactive({ seasonNumber: 1, seasonTitle: "第一季", episodeNumber: 1, title: "第一集" });
const shotForm = reactive({ sceneNumber: 1, sceneTitle: "场景 01", shotNumber: 1, durationMs: 6000, shotType: "", camera: "", lighting: "", dialogue: "", narration: "", prompt: "" });
const assetForm = reactive<{ assetType: AssetType; name: string; description: string; visualDescription: string }>({ assetType: "character", name: "", description: "", visualDescription: "" });
const generationForm = reactive<{ providerId: string; modelId: string; directory: string; mediaType: "image" | "video" | "audio"; resolution: string; prompt: string }>({ providerId: "", modelId: "", directory: "", mediaType: "video", resolution: "480p", prompt: "" });
const scriptDraft = reactive({ idea: "", body: "", style: defaultProductionStyle, aspectRatio: "16:9", episodeCount: 5, durationSeconds: 60 });
const dramaModeLabel = computed(() => ({ create: "剧本创作", adapt: "剧本改编", produce: "剧本制作", redraw: "原片转绘" })[dramaDraftMode.value]);
const modeDescription = computed(() => ({
  create: "附件内容会作为创作参考；没有附件时根据创作要求正常分析。",
  adapt: "依据待改编原稿和改编要求生成剧本，不覆盖原稿核心设定。",
  produce: "读取剧本正文并拆分为目标剧集、场景、镜头和主体资产。",
  redraw: "填写转绘要求并添加原片视频，当前仅保存在本地草稿。",
})[dramaDraftMode.value]);
const instructionLabel = computed(() => dramaDraftMode.value === "create" ? "创作要求" : dramaDraftMode.value === "adapt" ? "改编要求" : dramaDraftMode.value === "produce" ? "制作要求（可选）" : "转绘要求");
const instructionPlaceholder = computed(() => dramaDraftMode.value === "create" ? "输入故事梗概、人物设定或补充要求…" : dramaDraftMode.value === "adapt" ? "说明需要保留的主线、人物与可调整的部分…" : dramaDraftMode.value === "produce" ? "可选：补充剧本拆分或制作要求…" : "说明需要保留的剧情、镜头或视觉方向…");
const referenceUploadLabel = computed(() => dramaDraftMode.value === "redraw" ? "添加待转绘原片" : dramaDraftMode.value === "create" ? "添加小说 / 设定参考（可选）" : "添加剧本 / 参考文件");
const referenceAccept = computed(() => dramaDraftMode.value === "redraw" ? ".mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm" : ".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document");
const supportsModelScript = computed(() => dramaDraftMode.value === "create" || dramaDraftMode.value === "adapt" || dramaDraftMode.value === "produce");
const scriptAgentLabel = computed(() => ({ create: "原创编剧 Agent", adapt: "剧本改编 Agent", produce: "剧本拆分 Agent", redraw: "转绘 Agent 待接入" })[dramaDraftMode.value]);
const canPreviewScript = computed(() => {
  if (dramaDraftMode.value === "create") return Boolean(scriptDraft.idea.trim() || scriptReferenceText.value.trim());
  if (dramaDraftMode.value === "adapt" || dramaDraftMode.value === "produce") return Boolean(scriptDraft.body.trim() || scriptReferenceText.value.trim());
  return false;
});
const scriptModelOptions = computed(() => platformModels.textModels.map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), label: `${model.label} · ${model.providerLabel}` })));
const adaptTypeOptions = [{ value: "rewrite", label: "剧本改写" }, { value: "continue", label: "剧本续写" }, { value: "localize", label: "出海改编" }];
const selectedScriptModel = computed(() => {
  try {
    const value = JSON.parse(scriptModelValue.value) as unknown;
    return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" ? { providerId: value[0], modelId: value[1] } : null;
  } catch { return null; }
});
const currentInstruction = computed({
  get: () => dramaDraftMode.value === "create" ? scriptDraft.idea : dramaDraftInstruction.value,
  set: (value: string) => { if (dramaDraftMode.value === "create") scriptDraft.idea = value; else dramaDraftInstruction.value = value; },
});
const currentProjectId = computed(() => typeof route.params.projectId === "string" ? route.params.projectId : "");
const currentUserId = computed(() => auth.user?.id ?? "");
const currentRole = computed(() => project.value?.members.find(member => member.userId === auth.user?.id && member.status === "active")?.role ?? "viewer");
const primaryWorkflowSteps: { stage: ProductionStep; label: string }[] = [{ stage: "scripted", label: "分镜剧集" }, { stage: "assets", label: "主体资产" }, { stage: "storyboarded", label: "分镜脚本" }, { stage: "generating", label: "视频生成" }];
const stageKeys: StageKey[] = ["draft", "scripted", "assets", "storyboarded", "generating", "review", "approved", "delivered"];
const stageOrder = ["draft", "scripted", "storyboarded", "generating", "editing", "review", "approved", "delivered"] as const;
const stageMeta: Record<StageKey, { eyebrow: string; label: string; description: string }> = {
  draft: { eyebrow: "01 / 项目", label: "项目准备", description: "确认客户、预算、成员和项目边界，建立可追踪的生产单元。" },
  scripted: { eyebrow: "01 / 剧集", label: "分镜剧集", description: "确认剧集标题、顺序和目标时长，保存项目可追溯的剧集结构。" },
  assets: { eyebrow: "02 / 主体资产", label: "主体资产", description: "整理角色、场景和道具设定，形成分镜阶段可引用的一致性资料。" },
  storyboarded: { eyebrow: "03 / 分镜脚本", label: "分镜脚本", description: "逐集核对镜头时长、景别、主体、光影、声音和画面描述。" },
  generating: { eyebrow: "04 / 视频生成", label: "视频生成", description: "按镜头提交任务，随后在同一阶段完成审片、重拍、批准和交付。" },
  review: { eyebrow: "04 / 视频生成 · 审片", label: "审片与重拍", description: "逐个预览候选片段，记录审片意见并决定批准或退回重拍。" },
  approved: { eyebrow: "04 / 视频生成 · 批准", label: "批准版本", description: "确认镜头候选版本并检查全片是否达到交付条件。" },
  delivered: { eyebrow: "04 / 视频生成 · 交付", label: "交付归档", description: "导出 MP4、SRT、manifest 和审计包，保留版本哈希与审批证据。" },
};
const activeStage = computed<StageKey>(() => {
  const value = String(route.query.stage ?? "");
  const requested = value === "draft" ? "scripted" : value as StageKey;
  const primary = requested === "assets" || requested === "storyboarded" ? requested : ["generating", "review", "approved", "delivered"].includes(requested) ? "generating" : "scripted";
  if (stageKeys.includes(value as StageKey) && (primary === "generating" ? isVideoTaskReached(requested as Extract<StageKey, "generating" | "review" | "approved" | "delivered">) : isStepReached(primary))) return requested;
  if (!project.value?.episodes.length) return "scripted";
  if (videoProductionStarted.value) return project.value.status === "delivered" ? "delivered" : project.value.status === "approved" ? "approved" : project.value.shots.some(shot => shot.status === "review") ? "review" : "generating";
  if (!assetsReady.value) return "assets";
  return isStepReached("generating") ? "generating" : "storyboarded";
});
const activeStep = computed<ProductionStep>(() => activeStage.value === "assets" || activeStage.value === "storyboarded" ? activeStage.value : ["generating", "review", "approved", "delivered"].includes(activeStage.value) ? "generating" : "scripted");
const activeStepIndex = computed(() => String(primaryWorkflowSteps.findIndex(step => step.stage === activeStep.value) + 1).padStart(2, "0"));
const isVideoStage = computed(() => activeStep.value === "generating");
const activeEpisode = computed(() => project.value?.episodes.find(episode => episode.id === activeEpisodeId.value));
const episodeOptions = computed(() => (project.value?.episodes ?? []).map(episode => ({ value: episode.id, label: `第 ${episode.episodeNumber} 集 · ${episode.title}` })));
const activeEpisodeShots = computed(() => activeEpisode.value ? shotsForEpisode(activeEpisode.value.id) : []);
const activeEpisodeSceneCount = computed(() => activeEpisode.value ? episodeSceneCount(activeEpisode.value.id) : 0);
const pendingGenerationCount = computed(() => activeEpisodeShots.value.filter(shot => ["draft", "ready", "changesRequested"].includes(shot.status)).length);
const previewVariant = computed(() => selectedVariant.value ?? project.value?.variants[0]);
const scriptEntryMode = computed(() => activeStage.value === "scripted" && !project.value?.episodes.length);
const assetTypeOptions: { value: AssetType; label: string }[] = [{ value: "character", label: "角色" }, { value: "scene", label: "场景" }, { value: "prop", label: "道具" }];
const filteredAssets = computed(() => (project.value?.assets ?? []).filter(asset => asset.assetType === activeAssetType.value));
const assetImageModelOptions = computed(() => platformModels.mediaModels.filter(model => (model.mediaType ?? model.type) === "image").map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), label: `${model.label} · ${model.providerLabel}` })));
const assetImageSizeOptions = [{ value: "1K", label: "1K · 标准" }, { value: "2K", label: "2K · 高清" }];
const assetImageFinalPrompt = computed(() => selectedAsset.value ? buildAssetImagePrompt(selectedAsset.value, assetImagePrompt.value) : assetImagePrompt.value);
const assetCounts = computed(() => ({ character: project.value?.assets.filter(asset => asset.assetType === "character").length ?? 0, scene: project.value?.assets.filter(asset => asset.assetType === "scene").length ?? 0, prop: project.value?.assets.filter(asset => asset.assetType === "prop").length ?? 0 }));
const assetMissingItems = computed(() => {
  const current = project.value;
  if (!current) return [];
  const items: string[] = [];
  if (!assetCounts.value.character) items.push("至少一项角色设定");
  if (!assetCounts.value.scene) items.push("至少一项场景设定");
  const incomplete = current.assets.filter(asset => !asset.name.trim() || !asset.visualDescription?.trim()).length;
  if (incomplete) items.push(`${incomplete} 项资产缺少名称或视觉设定`);
  const uncovered = current.episodes.filter(episode => !current.assets.some(asset => !asset.episodeIds.length || asset.episodeIds.includes(episode.id))).length;
  if (uncovered) items.push(`${uncovered} 集尚无适用资产`);
  return items;
});
const assetsReady = computed(() => Boolean(project.value?.episodes.length && !assetMissingItems.value.length));
const storyboardMissingItems = computed(() => {
  const current = project.value;
  if (!current) return [];
  const items: string[] = [];
  const emptyEpisodes = current.episodes.filter(episode => !episodeShotCount(episode.id)).length;
  if (emptyEpisodes) items.push(`${emptyEpisodes} 集尚无镜头`);
  const incomplete = current.shots.filter(shot => !shot.prompt?.trim() || !shot.shotType?.trim() || shot.durationMs <= 0).length;
  if (incomplete) items.push(`${incomplete} 个镜头缺少画面描述、景别或有效时长`);
  return items;
});
const storyboardReady = computed(() => Boolean(project.value?.shots.length && !storyboardMissingItems.value.length));
const allShotsApproved = computed(() => Boolean(project.value?.shots.length && project.value.shots.every(shot => shot.status === "approved")));
const videoProductionStarted = computed(() => Boolean(project.value && (["generating", "editing", "review", "approved", "delivered"].includes(project.value.status) || project.value.variants.length || project.value.deliveries.length)));
const canManageAssets = computed(() => isStepReached("assets") && canEdit.value && !videoProductionStarted.value);
const assetReadinessText = computed(() => assetsReady.value ? `角色 ${assetCounts.value.character} 项 · 场景 ${assetCounts.value.scene} 项 · 道具 ${assetCounts.value.prop} 项，设定已完整。` : `待补齐：${assetMissingItems.value.join("；")}。`);
const activeStepReady = computed(() => activeStep.value === "scripted" ? Boolean(project.value?.episodes.length) : activeStep.value === "assets" ? assetsReady.value : activeStep.value === "storyboarded" ? isStepReached("storyboarded") && storyboardReady.value : isStepReached("generating"));
const activeStepReason = computed(() => stepReason(activeStep.value));
const scriptSceneCount = computed(() => scriptOutline.value.reduce((total, episode) => total + episode.scenes.length, 0));
const scriptShotCount = computed(() => scriptOutline.value.reduce((total, episode) => total + episode.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.length, 0), 0));
const canCreate = computed(() => project.value?.status !== "delivered" && ["owner", "producer", "writer", "director", "artist", "editor"].includes(currentRole.value));
const canEdit = computed(() => canCreate.value);
const canAdd = computed(() => canCreate.value && currentRole.value !== "editor");
const canGenerate = computed(() => ["owner", "producer", "director", "artist", "editor"].includes(currentRole.value) && !["approved", "delivered"].includes(project.value?.status ?? "delivered") && assetsReady.value && storyboardReady.value);
const canReview = computed(() => ["owner", "producer", "director", "editor", "reviewer"].includes(currentRole.value));
const canApprove = computed(() => ["owner", "producer", "reviewer"].includes(currentRole.value));
const canDeliverCut = computed(() => ["owner", "producer", "editor"].includes(currentRole.value));
const canEditEpisodes = computed(() => canAdd.value && !videoProductionStarted.value);
const canEditStoryboard = computed(() => canEdit.value && !videoProductionStarted.value);
const canExport = computed(() => Boolean(project.value && ["owner", "producer", "editor"].includes(currentRole.value) && project.value.status === "approved" && !project.value.deliveries.length && !exporting.value));
const generationShot = computed(() => activeEpisodeShots.value.find(shot => ["draft", "ready", "changesRequested"].includes(shot.status)));
const reviewShot = computed(() => activeEpisodeShots.value.find(shot => shot.status === "review"));
const activeEpisodeVariants = computed(() => {
  const priorities = ["approved", "candidate", "changesRequested"];
  return activeEpisodeShots.value.flatMap(shot => {
    const candidates = (project.value?.variants.filter(variant => variant.shotId === shot.id && variant.status !== "rejected") ?? [])
      .sort((left, right) => (priorities.indexOf(left.status) === -1 ? priorities.length : priorities.indexOf(left.status)) - (priorities.indexOf(right.status) === -1 ? priorities.length : priorities.indexOf(right.status)) || right.attemptNumber - left.attemptNumber);
    return candidates[0] ? [candidates[0]] : [];
  });
});
const videoTaskTabs = computed(() => [{ stage: "generating" as const, label: "生成", count: project.value?.shots.filter(shot => ["draft", "ready", "changesRequested", "generating"].includes(shot.status)).length ?? 0 }, { stage: "review" as const, label: "审片 / 重拍", count: project.value?.shots.filter(shot => shot.status === "review").length ?? 0 }, { stage: "approved" as const, label: "批准", count: project.value?.approvals.length ?? 0 }, { stage: "delivered" as const, label: "交付", count: project.value?.deliveries.length ?? 0 }]);
const stageMetricItems = computed<StageMetric[]>(() => {
  const current = project.value;
  if (!current) return [];
  const shots = current.shots;
  const approvedShots = shots.filter(shot => shot.status === "approved").length;
  const generatedShots = shots.filter(shot => ["review", "changesRequested", "approved"].includes(shot.status)).length;
  const metrics: Record<StageKey, StageMetric[]> = {
    draft: [{ label: "项目成员", value: current.members.length }, { label: "项目预算", value: `${current.budgetCents} 积分` }, { label: "剧集", value: current.episodes.length }],
    scripted: [{ label: "剧集", value: current.episodes.length }, { label: "有场景剧集", value: current.episodes.filter(episode => episodeSceneCount(episode.id) > 0).length }, { label: "镜头", value: shots.length }],
    assets: [{ label: "角色", value: assetCounts.value.character }, { label: "场景", value: assetCounts.value.scene }, { label: "道具", value: assetCounts.value.prop }],
    storyboarded: [{ label: "已填提示词", value: shots.filter(shot => Boolean(shot.prompt)).length }, { label: "镜头总数", value: shots.length }, { label: "目标时长", value: `${Math.round(shots.reduce((sum, shot) => sum + shot.durationMs, 0) / 1000)} 秒` }],
    generating: [{ label: "待生成镜头", value: shots.filter(shot => ["draft", "ready", "changesRequested"].includes(shot.status)).length }, { label: "已生成镜头", value: generatedShots }, { label: "候选版本", value: current.variants.length }],
    review: [{ label: "待审片镜头", value: shots.filter(shot => shot.status === "review").length }, { label: "候选版本", value: current.variants.length }, { label: "审片意见", value: current.reviews.length }],
    approved: [{ label: "批准镜头", value: `${approvedShots}/${shots.length}` }, { label: "审批记录", value: current.approvals.length }, { label: "可交付", value: allShotsApproved.value ? "是" : "否" }],
    delivered: [{ label: "交付包", value: current.deliveries.length }, { label: "交付文件", value: current.deliveries.length ? 4 : 0 }, { label: "版本哈希", value: current.deliveries.length ? "已记录" : "待生成" }],
  };
  return metrics[activeStage.value];
});
const mediaOptions = [{ value: "video", label: "视频" }, { value: "image", label: "图片" }, { value: "audio", label: "音频" }];
const resolutionOptions = [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }, { value: "4k", label: "4K" }];
const aspectRatioOptions = [{ value: "16:9", label: "16:9 横屏" }, { value: "9:16", label: "9:16 竖屏" }, { value: "1:1", label: "1:1 方形" }];
const statusLabels: Record<ProjectStatus, string> = { draft: "草稿", scripted: "已编剧", storyboarded: "已分镜", generating: "生成中", editing: "剪辑中", review: "待审片", approved: "已批准", delivered: "已交付" };
const shotLabels: Record<ShotStatus, string> = { draft: "草稿", ready: "待生成", generating: "生成中", review: "待审片", changesRequested: "需重拍", approved: "已批准" };

function errorText(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "连接中断，请刷新后重试" : error instanceof Error ? error.message : "操作失败，请重试"; }
function statusLabel(status: ProjectStatus) { return statusLabels[status] ?? status; }
function statusTone(status: string) { return status === "approved" || status === "delivered" ? "success" : status === "review" || status === "generating" ? "warning" : "neutral"; }
function shotTone(status: ShotStatus) { return status === "approved" ? "success" : status === "review" || status === "changesRequested" ? "warning" : status === "generating" ? "warning" : "neutral"; }
function shotStatusLabel(status: ShotStatus) { return shotLabels[status] ?? status; }
function roleLabel(role: string) { return ({ owner: "项目所有者", producer: "制片人", writer: "编剧", director: "导演", artist: "美术", editor: "剪辑师", reviewer: "审片人", viewer: "查看者" } as Record<string, string>)[role] ?? role; }
function isStepReached(step: ProductionStep) {
  const current = project.value;
  if (!current) return false;
  if (step === "scripted") return true;
  if (step === "assets") return current.episodes.length > 0;
  // ACT: 已有生成记录的旧项目可回看各步骤；再次生成仍需补齐新门槛。
  if (videoProductionStarted.value) return true;
  if (step === "storyboarded") return current.episodes.length > 0 && assetsReady.value;
  return current.episodes.length > 0 && assetsReady.value && storyboardReady.value && stageOrder.indexOf(current.status) >= stageOrder.indexOf("storyboarded");
}
function isVideoTaskReached(step: Extract<StageKey, "generating" | "review" | "approved" | "delivered">) {
  if (!isStepReached("generating") || !project.value) return false;
  if (step === "generating") return true;
  if (step === "review") return project.value.variants.length > 0;
  if (!allShotsApproved.value) return false;
  if (step === "approved") return true;
  return ["approved", "delivered"].includes(project.value.status) || project.value.deliveries.length > 0;
}
function stepReason(step: ProductionStep) {
  const current = project.value;
  if (!current) return "正在读取项目";
  if (step === "scripted") return current.episodes.length ? "剧集结构已保存" : "先完成剧集创作并保存剧集结构";
  if (step === "assets") return !current.episodes.length ? "先完成并保存至少一集" : assetReadinessText.value;
  if (step === "storyboarded") return !current.episodes.length ? "先完成剧集结构" : !assetsReady.value ? assetReadinessText.value : storyboardReady.value ? "分镜脚本已具备基础条件" : `待补齐：${storyboardMissingItems.value.join("；")}。`;
  if (!assetsReady.value) return "先完成主体资产设定";
  if (!storyboardReady.value) return `待补齐：${storyboardMissingItems.value.join("；")}。`;
  if (current.status === "draft" || current.status === "scripted") return "先在分镜脚本步骤确认并锁定分镜";
  return "视频生成阶段已开放";
}
function goStep(step: ProductionStep) { if (isStepReached(step)) void router.replace({ query: { ...route.query, stage: step } }); }
function goVideoTask(step: Extract<StageKey, "generating" | "review" | "approved" | "delivered">) { if (isVideoTaskReached(step)) void router.replace({ query: { ...route.query, stage: step } }); }
function assetTypeLabel(type: AssetType) { return assetTypeOptions.find(item => item.value === type)?.label ?? type; }
function assetEpisodeLabel(episodeIds: string[]) { return project.value?.episodes.filter(episode => episodeIds.includes(episode.id)).map(episode => `第${episode.episodeNumber}集`).join("、") || "所选剧集"; }
function buildAssetImagePrompt(asset: ProductionAsset, supplement = defaultAssetImageSupplement) {
  const settings = project.value?.creativeSettings;
  return [
    settings?.genre ? `题材方向：${settings.genre}` : "",
    settings?.fusionGenres?.length ? `融合题材：${settings.fusionGenres.join("、")}` : "",
    settings?.style ? `统一视觉风格：${settings.style}` : "",
    settings?.stylePrompt ? `风格提示：${settings.stylePrompt}` : "",
    settings?.styleNegativePrompt ? `风格排除：${settings.styleNegativePrompt}` : "",
    settings?.aspectRatio ? `画幅比例：${settings.aspectRatio}` : "",
    `主体类型：${assetTypeLabel(asset.assetType)}`,
    `主体名称：${asset.name}`,
    asset.description ? `设定说明：${asset.description}` : "",
    asset.visualDescription ? `视觉设定：${asset.visualDescription}` : "",
    supplement,
  ].filter(Boolean).join("\n\n");
}
function defaultAssetImageModel() {
  const defaultModel = platformModels.defaultModels.image;
  return defaultModel && platformModels.mediaModels.some(model => (model.mediaType ?? model.type) === "image" && model.providerId === defaultModel.providerId && model.modelId === defaultModel.modelId)
    ? defaultModel
    : platformModels.mediaModels.find(model => (model.mediaType ?? model.type) === "image");
}
async function loadAssetPreviewUrls(assets: ProductionAsset[]) {
  const ids = new Set(assets.map(asset => asset.id));
  for (const [id, release] of assetPreviewReleases) {
    if (!ids.has(id)) { release(); assetPreviewReleases.delete(id); delete assetPreviewUrls[id]; }
  }
  await Promise.all(assets.map(async asset => {
    assetPreviewReleases.get(asset.id)?.();
    assetPreviewReleases.delete(asset.id);
    delete assetPreviewUrls[asset.id];
    if (!asset.referencePath || !asset.referenceMimeType) return;
    try {
      const preview = useWorkspaceFiles(auth.personalDirectory).acquireUrl(asset.referencePath, asset.referenceMimeType);
      assetPreviewReleases.set(asset.id, preview.release);
      assetPreviewUrls[asset.id] = await preview.url;
    } catch (error) { errorMessage.value = errorText(error); }
  }));
}
function openAssetDetail(asset: ProductionAsset) {
  selectedAsset.value = asset;
  assetImagePrompt.value = defaultAssetImageSupplement;
  assetImageQuote.value = "";
  assetImageError.value = "";
  if (!assetImageModelValue.value) {
    const model = defaultAssetImageModel();
    if (model) assetImageModelValue.value = JSON.stringify([model.providerId, model.modelId]);
  }
  assetDetailVisible.value = true;
}
function closeAssetDetail() { assetImageQuote.value = ""; assetImageError.value = ""; }
function parseAssetImageModel() {
  try {
    const value = JSON.parse(assetImageModelValue.value) as unknown;
    return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" ? { providerId: value[0], modelId: value[1] } : null;
  } catch { return null; }
}
async function quoteAssetImage() {
  const model = parseAssetImageModel();
  if (!selectedAsset.value || !model) { assetImageError.value = "请先选择图片模型"; return; }
  assetImageBusy.value = true;
  assetImageError.value = "";
  try {
    const { data } = await axios.post<ApiResponse<{ credits: string }>>("/api/billing/quote", { providerId: model.providerId, modelId: model.modelId, mediaType: "image", units: 1, size: assetImageSize.value });
    assetImageQuote.value = data.data.credits;
  } catch (error) { assetImageError.value = errorText(error); }
  finally { assetImageBusy.value = false; }
}
async function submitAssetImage() {
  const model = parseAssetImageModel();
  if (!project.value || !selectedAsset.value || !model || !assetImageQuote.value) return;
  assetImageBusy.value = true;
  assetImageError.value = "";
  try {
    await axios.post("/api/productionProjects/assets/generate", { projectId: project.value.id, assetId: selectedAsset.value.id, directory: auth.personalDirectory, providerId: model.providerId, modelId: model.modelId, size: assetImageSize.value, ratio: project.value.creativeSettings?.aspectRatio, prompt: assetImagePrompt.value.trim() || buildAssetImagePrompt(selectedAsset.value) }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
    assetImageQuote.value = "";
    await loadProject();
    const refreshed = project.value?.assets.find(asset => asset.id === selectedAsset.value?.id);
    if (refreshed) { selectedAsset.value = refreshed; assetImagePrompt.value = defaultAssetImageSupplement; }
  } catch (error) { assetImageError.value = errorText(error); }
  finally { assetImageBusy.value = false; }
}
function openAssetForm(asset?: ProductionAsset) {
  if (!canManageAssets.value) return;
  editingAsset.value = asset;
  Object.assign(assetForm, asset ? { assetType: asset.assetType, name: asset.name, description: asset.description ?? "", visualDescription: asset.visualDescription ?? "" } : { assetType: activeAssetType.value, name: "", description: "", visualDescription: "" });
  resetDialog();
  assetVisible.value = true;
}
function shotsForEpisode(episodeId: string) { const sceneIds = new Set((project.value?.scenes as { id: string; episodeId: string }[] ?? []).filter(scene => scene.episodeId === episodeId).map(scene => scene.id)); return project.value?.shots.filter(shot => sceneIds.has(shot.sceneId)) ?? []; }
function episodeShotCount(episodeId: string) { return shotsForEpisode(episodeId).length; }
function episodeSceneCount(episodeId: string) { return (project.value?.scenes as { id: string; episodeId: string }[] ?? []).filter(scene => scene.episodeId === episodeId).length; }
function sceneTitleForShot(shot: Shot) { return ((project.value?.scenes as { id: string; title: string }[] ?? []).find(scene => scene.id === shot.sceneId)?.title) ?? "未命名场景"; }
function scriptScenesForEpisode(episodeId: string) {
  const scenes = (project.value?.scenes ?? []) as { id: string; episodeId: string; sceneNumber: number; title: string; continuityNotes: string | null }[];
  return scenes.filter(scene => scene.episodeId === episodeId).sort((left, right) => left.sceneNumber - right.sceneNumber).map(scene => ({ ...scene, shots: (project.value?.shots ?? []).filter(shot => shot.sceneId === scene.id).sort((left, right) => left.shotNumber - right.shotNumber) }));
}
const scriptOutputTokenLimit = computed(() => Math.min(12000, Math.max(2600, Math.round(scriptDraft.episodeCount * 1000))));
function buildScriptGenerationRequest() {
  if (!selectedScriptModel.value) throw new Error("请先选择可用的文本模型");
  const genre = findProductionGenre(dramaDraftGenre.value);
  const style = findProductionStyle(scriptDraft.style);
  if (!genre || !style) throw new Error("当前题材或风格预设不存在，请重新选择");
  const adaptationTask = ({ rewrite: "剧本改写：保留原稿的核心人物关系、因果和主题，按用户要求重构节奏与表达。", continue: "剧本续写：从原稿已有冲突和人物目标自然续写，不重置人物、不跳过已有伏笔。", localize: "出海改编：保留原稿主题与人物动机，将语言、场景和文化语境调整为目标市场可理解的表达。" } as Record<string, string>)[adaptType.value] ?? "剧本改写：保留原稿核心设定，按用户要求优化节奏与表达。";
  const taskPrompt = dramaDraftMode.value === "create"
    ? "你是原创漫剧编剧 Agent。根据创作要求写出完整的新故事；参考附件只补充人物、世界观或素材，不得把参考原文直接当成最终剧本。创作要求为空时，从参考附件归纳核心创意后再创作。"
    : dramaDraftMode.value === "adapt"
      ? `你是剧本改编 Agent。必须以 sourceScript 为原稿，执行以下改编任务：${adaptationTask} 保留原稿可辨认的核心冲突与人物动机；用户要求优先于题材预设。`
      : "你是剧本拆分 Agent。忠实读取 sourceScript，将已有剧本拆分为指定集数、场景与可执行镜头；不新增主线、不改写人物关系、不把梗概冒充剧本。剧本信息不足时仅补齐拍摄所需的场景和镜头表达。";
  const fusionPrompts = fusionGenres.value.map(name => {
    const preset = findProductionGenre(name);
    return preset ? `${name}: ${preset.storyPrompt.replaceAll("{{story}}", "用户创作输入").replaceAll("{{episodeCount}}", String(scriptDraft.episodeCount))}` : "";
  }).filter(Boolean);
  const sourceScript = [scriptDraft.body.trim() ? `【粘贴的原稿】\n${scriptDraft.body.trim()}` : "", scriptReferenceText.value].filter(Boolean).join("\n\n");
  const systemPrompt = [
    taskPrompt,
    dramaDraftMode.value === "create"
      ? `主叙事题材约束：${genre.storyPrompt.replaceAll("{{story}}", "用户创作输入").replaceAll("{{episodeCount}}", String(scriptDraft.episodeCount))}`
      : `题材设定为「${genre.nameZh}」，只用于理解和呈现原稿；不得借题材设定替换原稿主线。`,
    fusionPrompts.length ? `融合题材仅作为补充约束，不得覆盖原稿或主线：\n${fusionPrompts.join("\n")}` : "不附加融合题材。",
    `视觉风格约定：${style.positivePrompt}`,
    `视觉排除约定：${style.negativePrompt}`,
    `画幅比例为 ${scriptDraft.aspectRatio}。将视觉约定落实到每个镜头画面提示和资产 visualDescription，不要把视觉词代替剧情动作。目标 ${scriptDraft.episodeCount} 集，每集约 ${scriptDraft.durationSeconds} 秒。`,
    "必须精确输出指定集数，每集目标时长 60 秒，剧情应形成起因、推进、冲突和结尾钩子。每集至少 1 个场景；每个场景至少 1 个镜头，单集镜头合计不超过 12 个；镜头时长为 2 到 15 秒。对白、旁白可以为空字符串。主体资产至少包含 1 个角色和 1 个场景，可按剧情增加道具。为保证完整 JSON，字符串使用简洁中文，不得输出额外说明。",
    "JSON 顶层只能包含 logline、episodes、assets 三个键。assets 必须是与 episodes 同级的数组，至少含 1 个角色和 1 个场景；禁止遗漏 assets，禁止把 assets 或其 JSON 文本放入任何剧情、对白、旁白字段。严格遵守结构：{\"logline\":string,\"episodes\":[{\"title\":string,\"targetDurationSeconds\":number,\"scenes\":[{\"title\":string,\"continuityNotes\":string,\"shots\":[{\"durationSeconds\":number,\"shotType\":string,\"camera\":string,\"lighting\":string,\"prompt\":string,\"dialogue\":string,\"narration\":string}]}]}],\"assets\":[{\"assetType\":\"character\"|\"scene\"|\"prop\",\"name\":string,\"description\":string,\"visualDescription\":string}]}。不得输出 episodeNumber、sceneNumber、shotNumber，它们会按顺序自动编号。",
  ].join("\n\n");
  const userContent = JSON.stringify({
    mode: dramaDraftMode.value,
    creativeInstruction: dramaDraftMode.value === "create" ? scriptDraft.idea.trim() : dramaDraftInstruction.value.trim(),
    adaptType: dramaDraftMode.value === "adapt" ? adaptType.value || "rewrite" : undefined,
    referenceMaterial: dramaDraftMode.value === "create" ? scriptReferenceText.value || undefined : undefined,
    sourceScript: dramaDraftMode.value === "adapt" || dramaDraftMode.value === "produce" ? sourceScript || undefined : undefined,
    genre: genre.nameZh,
    fusionGenres: fusionGenres.value,
    style: style.nameZh,
    aspectRatio: scriptDraft.aspectRatio,
    episodeCount: scriptDraft.episodeCount,
    targetDurationSeconds: scriptDraft.durationSeconds,
    outputLanguage: outputLanguage.value,
  });
  const context = { systemPrompt, messages: [{ role: "user" as const, content: userContent, timestamp: Date.now() }] };
  return { providerId: selectedScriptModel.value.providerId, modelId: selectedScriptModel.value.modelId, systemPrompt, userContent, context };
}
function nonEmptyString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`模型返回的${name}为空`);
  return value.trim();
}
function parseGenerationJson(value: string): { parsed: Record<string, unknown>; repaired: boolean } {
  try { return { parsed: JSON.parse(value) as Record<string, unknown>, repaired: false }; }
  catch (parseError) {
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        const opening = stack.pop();
        if (!opening || (opening === "{" ? character !== "}" : character !== "]")) throw parseError;
      } else if (character === "," && value.startsWith(',"assets":', index) && stack.join("") === "{[{") {
        const repaired = `${value.slice(0, index)}}]${value.slice(index)}`;
        return { parsed: JSON.parse(repaired) as Record<string, unknown>, repaired: true };
      }
    }
    throw parseError;
  }
}
function fitShotDurations(shots: ScriptOutlineShot[], targetDurationMs: number) {
  const minimum = 2000;
  const maximum = 15000;
  let difference = targetDurationMs - shots.reduce((total, shot) => total + shot.durationMs, 0);
  if (targetDurationMs < shots.length * minimum || targetDurationMs > shots.length * maximum) throw new Error("镜头数量无法覆盖目标集数时长；未写入项目");
  for (let index = 0; difference && index < shots.length; index += 1) {
    const shot = shots[index]!;
    const remaining = shots.length - index;
    const step = Math.max(1, Math.ceil(Math.abs(difference) / remaining));
    const capacity = difference > 0 ? maximum - shot.durationMs : shot.durationMs - minimum;
    const adjustment = Math.min(step, capacity);
    shot.durationMs += difference > 0 ? adjustment : -adjustment;
    difference += difference > 0 ? -adjustment : adjustment;
  }
  if (difference) throw new Error("镜头时长无法匹配目标集数时长；未写入项目");
}
function parseScriptGenerationResult(value: string): ParsedScriptGeneration {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const { parsed, repaired } = parseGenerationJson(normalized);
  if (!Array.isArray(parsed.episodes)) throw new Error("模型输出缺少 episodes 数组；未写入项目");
  if (parsed.episodes.length !== scriptDraft.episodeCount) throw new Error(`模型应输出 ${scriptDraft.episodeCount} 集，实际返回 ${parsed.episodes.length} 集；未写入项目`);
  if (!Array.isArray(parsed.assets) || parsed.assets.length < 2 || parsed.assets.length > 24) throw new Error("模型主体资产数量无效，必须有 2 到 24 项；未写入项目");
  if (!parsed.assets.some(asset => asset && typeof asset === "object" && (asset as Record<string, unknown>).assetType === "character") || !parsed.assets.some(asset => asset && typeof asset === "object" && (asset as Record<string, unknown>).assetType === "scene")) throw new Error("模型资产缺少角色或场景设定；未写入项目");
  const episodes = parsed.episodes.map((rawEpisode, episodeIndex): ScriptOutlineEpisode => {
    if (!rawEpisode || typeof rawEpisode !== "object") throw new Error("模型返回的剧集结构无效");
    const episode = rawEpisode as Record<string, unknown>;
    if (!Array.isArray(episode.scenes) || episode.scenes.length < 1 || episode.scenes.length > 8) throw new Error(`第 ${episodeIndex + 1} 集场景数无效，必须为 1 到 8 个`);
    const scenes = episode.scenes.map((rawScene, sceneIndex): ScriptOutlineScene => {
      if (!rawScene || typeof rawScene !== "object") throw new Error("模型返回的场景结构无效");
      const scene = rawScene as Record<string, unknown>;
      if (!Array.isArray(scene.shots) || scene.shots.length < 1 || scene.shots.length > 12) throw new Error(`第 ${episodeIndex + 1} 集第 ${sceneIndex + 1} 场镜头数无效，必须为 1 到 12 个`);
      return {
        sceneNumber: sceneIndex + 1,
        title: nonEmptyString(scene.title, "场景标题"),
        continuityNotes: typeof scene.continuityNotes === "string" ? scene.continuityNotes.trim() : "",
        shots: scene.shots.map((rawShot, shotIndex): ScriptOutlineShot => {
          if (!rawShot || typeof rawShot !== "object") throw new Error("模型返回的镜头结构无效");
          const shot = rawShot as Record<string, unknown>;
          const seconds = Number(shot.durationSeconds);
          if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) throw new Error("模型返回的镜头时长必须在 2 到 15 秒之间");
          return { shotNumber: shotIndex + 1, durationMs: Math.round(seconds * 1000), shotType: nonEmptyString(shot.shotType, "镜头类型"), camera: typeof shot.camera === "string" ? shot.camera.trim() : "", lighting: typeof shot.lighting === "string" ? shot.lighting.trim() : "", prompt: nonEmptyString(shot.prompt, "镜头画面"), dialogue: typeof shot.dialogue === "string" ? shot.dialogue.trim() : "", narration: typeof shot.narration === "string" ? shot.narration.trim() : "" };
        }),
      };
    });
    const targetDurationMs = Math.max(1000, Math.round(Number(episode.targetDurationSeconds) * 1000) || scriptDraft.durationSeconds * 1000);
    const shots = scenes.flatMap(scene => scene.shots);
    fitShotDurations(shots, targetDurationMs);
    return {
      episodeNumber: episodeIndex + 1,
      title: nonEmptyString(episode.title, `第 ${episodeIndex + 1} 集标题`),
      targetDurationMs,
      scenes,
    };
  });
  const allowedTypes = new Set(["character", "scene", "prop"]);
  const assets = parsed.assets.map((rawAsset): ScriptOutlineAsset => {
    if (!rawAsset || typeof rawAsset !== "object") throw new Error("模型返回的资产结构无效");
    const asset = rawAsset as Record<string, unknown>;
    if (typeof asset.assetType !== "string" || !allowedTypes.has(asset.assetType)) throw new Error("模型返回了未知资产类型");
    return { assetType: asset.assetType as AssetType, name: nonEmptyString(asset.name, "资产名称"), description: typeof asset.description === "string" ? asset.description.trim() : "", visualDescription: nonEmptyString(asset.visualDescription, "资产视觉设定") };
  });
  return { result: { logline: nonEmptyString(parsed.logline, "全剧梗概"), episodes, assets }, repaired };
}
function parseStoredScriptGenerationResult(value: unknown): ScriptGenerationResult {
  if (!value || typeof value !== "object") throw new Error("服务器中的剧本预览结构无效");
  const parsed = value as Record<string, unknown>;
  if (typeof parsed.logline !== "string" || !Array.isArray(parsed.episodes) || parsed.episodes.length !== scriptDraft.episodeCount || !Array.isArray(parsed.assets) || parsed.assets.length < 2 || parsed.assets.length > 24) throw new Error("服务器中的剧本预览规格不完整");
  const episodes = parsed.episodes.map((value, episodeIndex): ScriptOutlineEpisode => {
    if (!value || typeof value !== "object") throw new Error("服务器中的剧集草案无效");
    const episode = value as Record<string, unknown>;
    if (typeof episode.title !== "string" || typeof episode.targetDurationMs !== "number" || !Number.isInteger(episode.targetDurationMs) || episode.targetDurationMs < 1000 || !Array.isArray(episode.scenes) || episode.scenes.length < 1 || episode.scenes.length > 8) throw new Error(`第 ${episodeIndex + 1} 集草案结构无效`);
    const scenes = episode.scenes.map((value, sceneIndex): ScriptOutlineScene => {
      if (!value || typeof value !== "object") throw new Error("服务器中的场景草案无效");
      const scene = value as Record<string, unknown>;
      if (typeof scene.title !== "string" || typeof scene.continuityNotes !== "string" || !Array.isArray(scene.shots) || scene.shots.length < 1 || scene.shots.length > 12) throw new Error(`第 ${episodeIndex + 1} 集第 ${sceneIndex + 1} 场草案结构无效`);
      const shots = scene.shots.map((value, shotIndex): ScriptOutlineShot => {
        if (!value || typeof value !== "object") throw new Error("服务器中的镜头草案无效");
        const shot = value as Record<string, unknown>;
        if (typeof shot.durationMs !== "number" || !Number.isInteger(shot.durationMs) || shot.durationMs < 2000 || shot.durationMs > 15000 || [shot.shotType, shot.camera, shot.lighting, shot.prompt, shot.dialogue, shot.narration].some(field => typeof field !== "string")) throw new Error("服务器中的镜头草案字段无效");
        return { shotNumber: shotIndex + 1, durationMs: shot.durationMs, shotType: shot.shotType as string, camera: shot.camera as string, lighting: shot.lighting as string, prompt: shot.prompt as string, dialogue: shot.dialogue as string, narration: shot.narration as string };
      });
      return { sceneNumber: sceneIndex + 1, title: scene.title, continuityNotes: scene.continuityNotes, shots };
    });
    return { episodeNumber: episodeIndex + 1, title: episode.title, targetDurationMs: episode.targetDurationMs, scenes };
  });
  const allowedTypes = new Set(["character", "scene", "prop"]);
  const assets = parsed.assets.map((value): ScriptOutlineAsset => {
    if (!value || typeof value !== "object") throw new Error("服务器中的资产草案无效");
    const asset = value as Record<string, unknown>;
    if (typeof asset.assetType !== "string" || !allowedTypes.has(asset.assetType) || [asset.name, asset.description, asset.visualDescription].some(field => typeof field !== "string")) throw new Error("服务器中的资产草案字段无效");
    return { assetType: asset.assetType as AssetType, name: asset.name as string, description: asset.description as string, visualDescription: asset.visualDescription as string };
  });
  if (!assets.some(asset => asset.assetType === "character") || !assets.some(asset => asset.assetType === "scene")) throw new Error("服务器中的剧本预览缺少角色或场景资产");
  return { logline: parsed.logline, episodes, assets };
}
async function quoteScriptGeneration() {
  if (!canPreviewScript.value || !project.value || !selectedScriptModel.value) return;
  scriptQuoting.value = true;
  scriptError.value = "";
  scriptQuote.value = null;
  try {
    const request = buildScriptGenerationRequest();
    const inputBytes = new TextEncoder().encode(JSON.stringify(request.context)).length + 512;
    const { data } = await axios.post<ApiResponse<ScriptGenerationQuote>>("/api/billing/quote", { providerId: request.providerId, modelId: request.modelId, mediaType: "text", textBudget: { input: inputBytes, output: scriptOutputTokenLimit.value, estimation: "剧本提示词 UTF-8 字节预留 + 512 overhead；输出按 token 上限预留" } });
    scriptQuote.value = data.data;
    scriptPreviewVisible.value = false;
  } catch (error) { scriptError.value = errorText(error); }
  finally { scriptQuoting.value = false; }
}
async function generateScriptOutline() {
  if (!canPreviewScript.value || !project.value || !selectedScriptModel.value || !scriptQuote.value) return;
  scriptGenerating.value = true;
  scriptError.value = "";
  scriptPreviewVisible.value = false;
  scriptGenerationUsage.value = null;
  scriptGenerationData.value = null;
  scriptQuote.value = null;
  try {
    const request = buildScriptGenerationRequest();
    const session = getSessionSnapshot();
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "x-account-id": auth.user?.id ?? "", "x-csrf-token": auth.csrfToken, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ providerId: request.providerId, modelId: request.modelId, projectId: project.value.id, maxTokens: scriptOutputTokenLimit.value, context: request.context }),
      signal: session.signal,
    });
    if (!response.ok || !response.body) {
      const failure = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(failure?.message || `模型请求失败（HTTP ${response.status}）`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let responseText = "";
    let failureMessage = "";
    let stopReason = "";
    let usage: { input: number; output: number; totalTokens: number; cost: { total: number } } | undefined;
    const consume = (block: string) => {
      const dataLines = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim());
      for (const line of dataLines) {
        if (!line) continue;
        const event = JSON.parse(line) as { type?: string; delta?: string; message?: string | { content?: unknown; stopReason?: string; usage?: typeof usage }; };
        if (event.type === "text" && typeof event.delta === "string") responseText += event.delta;
        if (event.type === "error") failureMessage = typeof event.message === "string" ? event.message : "文本模型生成失败";
        if (event.type === "done" && event.message && typeof event.message === "object") {
          if (event.message.usage) usage = event.message.usage;
          if (event.message.stopReason) stopReason = event.message.stopReason;
          if (!responseText && Array.isArray(event.message.content)) responseText = event.message.content.filter((part): part is { type: string; text: string } => Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string").map(part => part.text).join("");
        }
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, "");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      blocks.forEach(consume);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (failureMessage) throw new Error(failureMessage);
    scriptGenerationUsage.value = usage ? { input: usage.input, output: usage.output, total: usage.totalTokens, cost: usage.cost.total } : null;
    const generationData: ProductionDraftGeneration = {
      rawText: responseText,
      generatedAt: new Date().toISOString(),
      providerId: request.providerId,
      modelId: request.modelId,
      stopReason,
      status: "raw",
      usage: scriptGenerationUsage.value ? { input: scriptGenerationUsage.value.input, output: scriptGenerationUsage.value.output, total: scriptGenerationUsage.value.total, cost: scriptGenerationUsage.value.cost } : null,
    };
    scriptGenerationData.value = generationData;
    let draftSaveError = "";
    try { await persistProductionDraft(generationData); }
    catch (error) { draftSaveError = errorText(error); }
    let result: ScriptGenerationResult;
    let repaired = false;
    try {
      const parsed = parseScriptGenerationResult(responseText);
      result = parsed.result;
      repaired = parsed.repaired;
    }
    catch (error) {
      const message = stopReason === "length" ? `模型输出达到上限后被截断；本次 ${usage?.output ?? "未知"} 个输出 tokens 已按实际用量结算。请减少集数或缩短输入后重试。` : errorText(error);
      scriptGenerationData.value = { ...generationData, status: "invalid", error: message };
      try { await persistProductionDraft(scriptGenerationData.value); }
      catch (saveError) { scriptError.value = `${message}；服务器未能保存原始模型返回：${errorText(saveError)}`; return; }
      scriptError.value = message;
      return;
    }
    scriptLogline.value = result.logline;
    scriptOutline.value = result.episodes;
    scriptAssets.value = result.assets;
    scriptPreviewVisible.value = true;
    scriptQuote.value = null;
    scriptGenerationData.value = { ...generationData, status: "parsed", error: repaired ? "模型 JSON 缺少剧集闭合，已修复边界" : undefined, result: result as unknown as Record<string, unknown> };
    try { await persistProductionDraft(scriptGenerationData.value); draftSaveError = ""; }
    catch (error) { scriptError.value = `剧本预览已生成，但服务器草稿未保存：${errorText(error)}`; }
    if (draftSaveError) scriptError.value = `剧本预览已生成，但模型原文未能持久化：${draftSaveError}`;
    else if (repaired) scriptError.value = "模型 JSON 的剧集边界不完整，已按结构补齐；请检查生成内容后再确认保存";
  } catch (error) { scriptError.value = errorText(error); }
  finally { scriptGenerating.value = false; }
}
async function handleScriptReference(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;
  if (!currentProjectId.value || !currentUserId.value) { scriptError.value = "项目或账号信息尚未就绪，无法暂存附件"; return; }
  const projectId = currentProjectId.value;
  const userId = currentUserId.value;
  if (scriptReferenceFiles.value.length + files.length > 10) { scriptError.value = "一个项目最多暂存 10 个附件"; return; }
  const allowedExtensions = dramaDraftMode.value === "redraw" ? [".mp4", ".mov", ".webm", ".m4v"] : [".txt", ".md", ".docx"];
  const maxSize = dramaDraftMode.value === "redraw" ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
  for (const file of files) {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!allowedExtensions.includes(extension)) { scriptError.value = `${file.name} 的文件类型不适用于当前模式`; return; }
    if (file.size <= 0 || file.size > maxSize) { scriptError.value = `${file.name} 为空或超过 ${dramaDraftMode.value === "redraw" ? "500 MB" : "50 MB"} 限制`; return; }
  }
  try {
    for (const file of files) {
      const reference = await saveProductionDraftFile(projectId, userId, file);
      if (currentProjectId.value !== projectId || currentUserId.value !== userId) { await removeProductionDraftFile(projectId, userId, reference.storageKey); return; }
      scriptReferenceFiles.value.push(reference);
      if (isTextScriptReference(reference)) {
        const referenceText = await readScriptReferenceText(reference, file);
        scriptReferenceText.value = [scriptReferenceText.value, referenceText].filter(Boolean).join("\n\n").slice(0, 120000);
      }
    }
    scriptError.value = "";
  } catch (error) { scriptError.value = errorText(error); }
}
async function removeScriptReference(file: ProductionDraftFileRef) {
  if (!currentProjectId.value || !currentUserId.value) return;
  try {
    await removeProductionDraftFile(currentProjectId.value, currentUserId.value, file.storageKey);
    scriptReferenceFiles.value = scriptReferenceFiles.value.filter(item => item.storageKey !== file.storageKey);
    await refreshScriptReferenceText();
  } catch (error) { scriptError.value = errorText(error); }
}
function formatFileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function isTextScriptReference(file: ProductionDraftFileRef) { return /\.(txt|md|docx)$/i.test(file.name); }
async function readScriptReferenceText(file: ProductionDraftFileRef, blob: File | null) {
  if (!blob || !isTextScriptReference(file)) return "";
  let value = "";
  if (/\.docx$/i.test(file.name)) {
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: entry => entry.name === "word/document.xml" && entry.originalSize <= 2 * 1024 * 1024 });
    const documentXml = archive["word/document.xml"];
    if (!documentXml) throw new Error(`${file.name} 的正文超过 2 MB 或无法读取`);
    const document = new DOMParser().parseFromString(new TextDecoder().decode(documentXml), "application/xml");
    if (document.querySelector("parsererror")) throw new Error(`${file.name} 不是可读取的 DOCX 文档`);
    const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    value = Array.from(document.getElementsByTagNameNS(wordNamespace, "p"))
      .map(paragraph => Array.from(paragraph.getElementsByTagNameNS(wordNamespace, "t")).map(node => node.textContent ?? "").join(""))
      .filter(Boolean)
      .join("\n");
  } else {
    value = await blob.slice(0, 480000).text();
  }
  value = value.replace(/\u0000/g, "").trim().slice(0, 120000);
  return value ? `【参考剧本：${file.name}】\n${value}` : "";
}
async function refreshScriptReferenceText(files = scriptReferenceFiles.value) {
  if (!draftScope.projectId || !draftScope.userId) {
    scriptReferenceText.value = "";
    return;
  }
  const references = await Promise.all(files.map(async file => readScriptReferenceText(file, await readProductionDraftFile(draftScope.projectId, draftScope.userId, file.storageKey))));
  scriptReferenceText.value = references.filter(Boolean).join("\n\n").slice(0, 120000);
}
async function createScriptStructure() {
  if (!supportsModelScript.value || !project.value || project.value.episodes.length || !scriptPreviewVisible.value || !scriptOutline.value.length) {
    scriptError.value = "当前项目没有可确认的剧本草案";
    return;
  }
  if (!scriptGenerationData.value || scriptGenerationData.value.status !== "parsed") {
    scriptError.value = "缺少已解析的模型生成记录，请重新生成后再确认";
    return;
  }
  const model = selectedScriptModel.value;
  if (!model) { scriptError.value = "请先选择文本模型"; return; }
  scriptCreating.value = true;
  scriptError.value = "";
  try {
    await axios.post<ApiResponse<unknown>>("/api/productionProjects/script/save", {
      projectId: project.value.id,
      logline: scriptLogline.value.trim(),
      sourceGeneration: { ...scriptGenerationData.value, result: { logline: scriptLogline.value, episodes: scriptOutline.value, assets: scriptAssets.value } },
      generation: {
        ...model,
        genre: dramaDraftGenre.value,
        fusionGenres: fusionGenres.value,
        style: scriptDraft.style,
        aspectRatio: scriptDraft.aspectRatio,
        stylePrompt: findProductionStyle(scriptDraft.style)?.positivePrompt,
        styleNegativePrompt: findProductionStyle(scriptDraft.style)?.negativePrompt,
      },
      assets: scriptAssets.value.map(asset => ({ ...asset, name: asset.name.trim(), description: asset.description.trim(), visualDescription: asset.visualDescription.trim() })),
      episodes: scriptOutline.value.map(episode => ({ ...episode, title: episode.title.trim(), scenes: episode.scenes.map(scene => ({ ...scene, title: scene.title.trim(), continuityNotes: scene.continuityNotes.trim(), shots: scene.shots.map(shot => ({ ...shot, prompt: shot.prompt.trim(), dialogue: shot.dialogue.trim(), narration: shot.narration.trim() })) })) })),
    });
    scriptPreviewVisible.value = false;
    scriptQuote.value = null;
    scriptGenerationData.value = null;
    await loadProject();
    goStep("assets");
  } catch (error) { scriptError.value = errorText(error); }
  finally { scriptCreating.value = false; }
}
async function advanceToVideo() { if (!project.value || !assetsReady.value || !storyboardReady.value) return; busy.value = true; errorMessage.value = ""; try { if (project.value.status === "scripted") await axios.put("/api/productionProjects/save", { projectId: project.value.id, status: "storyboarded" }); await loadProject(); goVideoTask("generating"); } catch (error) { errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function submitAsset() {
  if (!project.value || !canManageAssets.value || !assetForm.name.trim() || !assetForm.visualDescription.trim()) return;
  busy.value = true;
  resetDialog();
  const input = { projectId: project.value.id, assetType: assetForm.assetType, name: assetForm.name.trim(), description: assetForm.description.trim(), visualDescription: assetForm.visualDescription.trim(), episodeIds: editingAsset.value?.episodeIds ?? [] };
  try {
    if (editingAsset.value) await axios.put("/api/productionProjects/assets/save", { ...input, assetId: editingAsset.value.id });
    else await axios.post("/api/productionProjects/assets/create", input);
    assetVisible.value = false;
    activeAssetType.value = input.assetType;
    await loadProject();
  } catch (error) { dialogError.value = errorText(error); }
  finally { busy.value = false; }
}
async function loadProject() { loading.value = true; errorMessage.value = ""; try { const { data } = await axios.get<ApiResponse<ProjectPayload>>("/api/productionProjects/get", { params: { projectId: String(route.params.projectId) } }); const payload = data.data; project.value = { ...payload.project, members: payload.members, seasons: payload.seasons, episodes: payload.episodes, scenes: payload.scenes, shots: payload.shots, assets: payload.assets ?? [], variants: payload.variants, reviews: payload.reviews, approvals: payload.approvals, deliveries: payload.deliveries }; projectRefreshKey.value++; await loadAssetPreviewUrls(project.value.assets); if (!activeEpisodeId.value && project.value.episodes[0]) activeEpisodeId.value = project.value.episodes[0].id; const currentVariant = selectedVariant.value && project.value.variants.find(variant => variant.id === selectedVariant.value?.id); selectedVariant.value = currentVariant; if (!selectedVariant.value && project.value.variants[0]) await selectVariantPreview(project.value.variants[0]); } catch (error) { errorMessage.value = errorText(error); } finally { loading.value = false; } }
function resetDialog() { dialogError.value = ""; }
function openShotForm(episodeId: string, shot?: Shot) {
  selectedEpisodeId.value = episodeId;
  editingShot.value = shot;
  const scenes = (project.value?.scenes ?? []) as { id: string; episodeId: string; sceneNumber: number; title: string }[];
  const scene = shot ? scenes.find(item => item.id === shot.sceneId) : undefined;
  const episodeShots = shotsForEpisode(episodeId);
  const lastShot = episodeShots.at(-1);
  const lastScene = lastShot ? scenes.find(item => item.id === lastShot.sceneId) : undefined;
  const lastSceneShots = lastScene ? episodeShots.filter(item => item.sceneId === lastScene.id) : [];
  Object.assign(shotForm, shot ? { sceneNumber: scene?.sceneNumber ?? 1, sceneTitle: scene?.title ?? "场景 01", shotNumber: shot.shotNumber, durationMs: shot.durationMs, shotType: shot.shotType ?? "", camera: shot.camera ?? "", lighting: shot.lighting ?? "", dialogue: shot.dialogue ?? "", narration: shot.narration ?? "", prompt: shot.prompt ?? "" } : { sceneNumber: lastScene?.sceneNumber ?? 1, sceneTitle: lastScene?.title ?? "场景 01", shotNumber: (lastSceneShots.at(-1)?.shotNumber ?? 0) + 1, durationMs: 6000, shotType: "", camera: "", lighting: "", dialogue: "", narration: "", prompt: "" });
  resetDialog();
  shotVisible.value = true;
}
function selectShotForGeneration(shot: Shot) { selectedShot.value = shot; generationForm.directory = auth.personalDirectory; generationForm.prompt = shot.prompt ?? ""; resetDialog(); generateVisible.value = true; }
async function selectVariantPreview(variant: Variant) { selectedVariant.value = variant; variantRelease?.(); variantRelease = undefined; variantUrl.value = ""; try { const preview = useWorkspaceFiles(auth.personalDirectory).acquireUrl(variant.filePath, variant.mimeType); variantRelease = preview.release; variantUrl.value = await preview.url; } catch (error) { errorMessage.value = errorText(error); } }
function openEditorForEpisode() {
  if (!project.value || !activeEpisode.value || !activeEpisodeVariants.value.length || !canDeliverCut.value) return;
  void router.push({ path: "/videoEditor", query: { productionProjectId: project.value.id, episodeId: activeEpisode.value.id, variantIds: JSON.stringify(activeEpisodeVariants.value.map(variant => variant.id)) } });
}
function openEditorForVariant(variant: Variant) {
  if (!project.value || !canDeliverCut.value) return;
  const episode = project.value.episodes.find(item => shotsForEpisode(item.id).some(shot => shot.id === variant.shotId));
  void router.push({ path: "/videoEditor", query: { productionProjectId: project.value.id, ...(episode ? { episodeId: episode.id } : {}), variantId: variant.id, variantIds: JSON.stringify([variant.id]) } });
}
async function selectShotForReview(shot: Shot) { selectedShot.value = shot; const variant = project.value?.variants.find(value => value.shotId === shot.id && value.status === "candidate"); reviewComment.value = ""; resetDialog(); if (variant) await selectVariantPreview(variant); else { selectedVariant.value = undefined; variantRelease?.(); variantRelease = undefined; variantUrl.value = ""; } reviewVisible.value = true; }
function closeReview() { variantRelease?.(); variantRelease = undefined; variantUrl.value = ""; }
function deliveryFiles(delivery: Delivery) { return [{ label: "下载 MP4", path: delivery.mp4Path }, { label: "下载 SRT", path: delivery.srtPath }, { label: "下载 manifest", path: delivery.manifestPath }, { label: "下载审计包", path: delivery.auditPackagePath }]; }
async function downloadDeliveryFile(path: string) { downloadingPath.value = path; try { const preview = useWorkspaceFiles(auth.personalDirectory).acquireUrl(path); const url = await preview.url; const anchor = document.createElement("a"); anchor.href = url; anchor.download = path.split("/").pop() || "delivery-file"; anchor.click(); setTimeout(() => preview.release(), 1000); } catch (error) { errorMessage.value = errorText(error); } finally { downloadingPath.value = ""; } }
async function submitEpisode() { if (!project.value || !canEditEpisodes.value) return; busy.value = true; resetDialog(); try { await axios.post("/api/productionProjects/episodes/create", { projectId: project.value.id, ...episodeForm }); episodeVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function submitShot() {
  if (!project.value || !canEditStoryboard.value) return;
  busy.value = true;
  resetDialog();
  const fields = { durationMs: shotForm.durationMs, shotType: shotForm.shotType || null, camera: shotForm.camera || null, lighting: shotForm.lighting || null, dialogue: shotForm.dialogue || null, narration: shotForm.narration || null, prompt: shotForm.prompt };
  try {
    if (editingShot.value) await axios.put("/api/productionProjects/shots/save", { projectId: project.value.id, shotId: editingShot.value.id, ...fields });
    else await axios.post("/api/productionProjects/shots/create", { projectId: project.value.id, episodeId: selectedEpisodeId.value, ...shotForm });
    shotVisible.value = false;
    editingShot.value = undefined;
    await loadProject();
  } catch (error) { dialogError.value = errorText(error); }
  finally { busy.value = false; }
}
async function submitGeneration() { if (!project.value || !selectedShot.value) return; busy.value = true; resetDialog(); try { await axios.post("/api/productionProjects/shots/generate", { projectId: project.value.id, shotId: selectedShot.value.id, directory: generationForm.directory || auth.personalDirectory, mediaType: generationForm.mediaType, providerId: generationForm.providerId, modelId: generationForm.modelId, prompt: generationForm.prompt, resolution: generationForm.mediaType === "video" ? generationForm.resolution : undefined, duration: generationForm.mediaType === "video" ? selectedShot.value.durationMs / 1000 : undefined }, { headers: { "Idempotency-Key": crypto.randomUUID() } }); generateVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function submitDecision(decision: "approved" | "changesRequested") { if (!project.value || !selectedVariant.value) return; busy.value = true; resetDialog(); try { await axios.post("/api/productionProjects/reviews/decision", { projectId: project.value.id, variantId: selectedVariant.value.id, decision, comment: reviewComment.value.trim() || undefined }); reviewVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function exportDelivery() { if (!project.value || !canExport.value) return; exporting.value = true; errorMessage.value = ""; try { await axios.post("/api/productionProjects/delivery/export", { projectId: project.value.id, directory: auth.personalDirectory }); await loadProject(); } catch (error) { errorMessage.value = errorText(error); } finally { exporting.value = false; } }
function buildProductionDraft(): ProductionDramaDraft {
  return {
    mode: dramaDraftMode.value,
    instruction: currentInstruction.value,
    pastedScript: scriptDraft.body,
    files: scriptReferenceFiles.value,
    style: scriptDraft.style,
    genre: dramaDraftGenre.value,
    fusionGenres: fusionGenres.value,
    aspectRatio: scriptDraft.aspectRatio,
    episodeCount: scriptDraft.episodeCount,
    textModel: scriptModelValue.value,
    adaptType: adaptType.value,
    outputLanguage: outputLanguage.value,
  };
}
async function persistProductionDraft(generationData = scriptGenerationData.value) {
  if (!draftScope.projectId || !draftScope.userId) return;
  await saveProductionDraft(draftScope.projectId, draftScope.userId, buildProductionDraft(), generationData);
}
let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;
let draftScope = { projectId: "", userId: "" };
function scheduleProductionDraftSave() {
  if (!draftReady.value) return;
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => { draftSaveTimer = undefined; void persistProductionDraft().catch(error => { scriptError.value = errorText(error); }); }, 250);
}
watch([dramaDraftMode, () => scriptDraft.idea, () => scriptDraft.body, () => scriptDraft.episodeCount, () => scriptDraft.durationSeconds, () => scriptDraft.style, () => dramaDraftGenre.value, fusionGenres, () => scriptDraft.aspectRatio, scriptModelValue], () => {
  if (restoringDraft) return;
  scriptPreviewVisible.value = false;
  scriptOutline.value = [];
  scriptAssets.value = [];
  scriptLogline.value = "";
  scriptQuote.value = null;
  scriptGenerationUsage.value = null;
  scriptGenerationData.value = null;
});
watch([dramaDraftMode, () => currentInstruction.value, () => scriptDraft.body, () => scriptDraft.style, () => dramaDraftGenre.value, fusionGenres, () => scriptDraft.aspectRatio, () => scriptDraft.episodeCount, adaptType, outputLanguage, scriptReferenceFiles], scheduleProductionDraftSave, { deep: true });
watch([scriptLogline, scriptOutline, scriptAssets], () => {
  const generation = scriptGenerationData.value;
  if (generation?.status !== "parsed") return;
  generation.result = { logline: scriptLogline.value, episodes: scriptOutline.value, assets: scriptAssets.value };
  scheduleProductionDraftSave();
}, { deep: true });
async function restoreDramaDraft() {
  const { projectId, userId } = draftScope;
  if (!projectId || !userId) return;
  restoringDraft = true;
  try {
    const snapshot = await readProductionDraft(projectId, userId);
    if (!snapshot) return;
    const draft = snapshot.draft;
    if (currentProjectId.value !== projectId || currentUserId.value !== userId) return;
    dramaDraftMode.value = draft.mode;
    if (draft.mode === "create") scriptDraft.idea = draft.instruction;
    else dramaDraftInstruction.value = draft.instruction;
    scriptDraft.body = draft.pastedScript;
    scriptDraft.style = draft.style;
    dramaDraftGenre.value = draft.genre;
    fusionGenres.value = draft.fusionGenres;
    scriptDraft.aspectRatio = draft.aspectRatio;
    scriptDraft.episodeCount = Math.min(12, draft.episodeCount);
    scriptModelValue.value = draft.textModel;
    adaptType.value = draft.adaptType;
    outputLanguage.value = draft.outputLanguage;
    const storedFiles = await Promise.all(draft.files.map(async file => ({ file, blob: await readProductionDraftFile(projectId, userId, file.storageKey) })));
    if (draftScope.projectId !== projectId || draftScope.userId !== userId) return;
    scriptReferenceFiles.value = storedFiles.filter(item => item.blob).map(item => item.file);
    scriptReferenceText.value = (await Promise.all(storedFiles.filter(item => item.blob).map(item => readScriptReferenceText(item.file, item.blob)))).filter(Boolean).join("\n\n").slice(0, 120000);
    if (scriptReferenceFiles.value.length !== draft.files.length) scriptError.value = "部分本地附件已不在此浏览器中，原文件未恢复";
    const generation = snapshot.generationData;
    if (generation) {
      scriptGenerationData.value = generation;
      scriptGenerationUsage.value = generation.usage;
      try {
        const parsed = generation.status === "parsed" && generation.result
          ? { result: parseStoredScriptGenerationResult(generation.result), repaired: false }
          : parseScriptGenerationResult(generation.rawText);
        scriptLogline.value = parsed.result.logline;
        scriptOutline.value = parsed.result.episodes;
        scriptAssets.value = parsed.result.assets;
        scriptPreviewVisible.value = true;
        if (generation.status !== "parsed" || parsed.repaired) {
          scriptGenerationData.value = { ...generation, status: "parsed", error: parsed.repaired ? "模型 JSON 缺少剧集闭合，已修复边界" : undefined, result: parsed.result as unknown as Record<string, unknown> };
          await persistProductionDraft(scriptGenerationData.value);
        }
        if (parsed.repaired) scriptError.value = "模型 JSON 的剧集边界不完整，已按结构补齐；请检查生成内容后再确认保存";
      } catch (error) {
        scriptError.value = generation.error || errorText(error) || "上次模型输出未通过结构校验；原始响应已保存在项目草稿中";
      }
    }
  } catch (error) { scriptError.value = errorText(error); }
  finally { restoringDraft = false; }
}
async function switchDraftScope() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = undefined;
  const shouldPersist = draftReady.value;
  draftReady.value = false;
  if (shouldPersist) await persistProductionDraft();
  draftScope = { projectId: currentProjectId.value, userId: currentUserId.value };
  dramaDraftMode.value = "create";
  dramaDraftInstruction.value = "";
  dramaDraftGenre.value = "都市爽文逆袭";
  fusionGenres.value = [];
  adaptType.value = "";
  outputLanguage.value = "中文";
  Object.assign(scriptDraft, { idea: "", body: "", style: defaultProductionStyle, aspectRatio: "16:9", episodeCount: 5, durationSeconds: 60 });
  scriptReferenceFiles.value = [];
  scriptReferenceText.value = "";
  scriptPreviewVisible.value = false;
  scriptOutline.value = [];
  scriptAssets.value = [];
  scriptLogline.value = "";
  scriptQuote.value = null;
  scriptGenerationUsage.value = null;
  scriptGenerationData.value = null;
  scriptError.value = "";
  await restoreDramaDraft();
  if (draftScope.projectId !== currentProjectId.value || draftScope.userId !== currentUserId.value) { await switchDraftScope(); return; }
  draftReady.value = true;
}
watch([currentProjectId, currentUserId], async () => { if (draftReady.value) { await switchDraftScope(); await loadProject(); } });
function persistBeforeUnload() { if (draftReady.value) void persistProductionDraft(); }
onMounted(async () => {
  await auth.restoreSession();
  await switchDraftScope();
  window.addEventListener("pagehide", persistBeforeUnload);
  window.addEventListener("beforeunload", persistBeforeUnload);
  await loadProject();
  await platformModels.load();
  const defaultTextModel = platformModels.defaultModels.text;
  const selectedModel = defaultTextModel && platformModels.textModels.some(model => model.providerId === defaultTextModel.providerId && model.modelId === defaultTextModel.modelId)
    ? defaultTextModel
    : platformModels.textModels[0];
  if (selectedModel) scriptModelValue.value = JSON.stringify([selectedModel.providerId, selectedModel.modelId]);
  const imageModel = defaultAssetImageModel();
  if (imageModel) assetImageModelValue.value = JSON.stringify([imageModel.providerId, imageModel.modelId]);
});
onBeforeUnmount(() => { if (draftSaveTimer) clearTimeout(draftSaveTimer); persistBeforeUnload(); window.removeEventListener("pagehide", persistBeforeUnload); window.removeEventListener("beforeunload", persistBeforeUnload); variantRelease?.(); for (const release of assetPreviewReleases.values()) release(); assetPreviewReleases.clear(); });
</script>

<style scoped lang="scss">
.pageError { margin: 0 0 20px; color: var(--uiStatusError); line-height: 1.6; }
.generationUsageNote { margin: -10px 0 18px; color: var(--uiTextMuted); font-size: 12px; line-height: 1.6; }
.loadingState, .inlineEmpty { padding: 24px; color: var(--uiTextMuted); text-align: center; }
.projectHero { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; padding: 26px 28px; border: 1px solid var(--uiBorderDefault); border-radius: 18px; background: linear-gradient(120deg, var(--uiSurfaceRaised), color-mix(in srgb, var(--uiActionPrimary) 6%, var(--uiSurfaceRaised))); .heroKicker { color: var(--uiTextMuted); font: 11px ui-monospace, monospace; } h2 { margin: 12px 0 8px; font-size: clamp(25px, 3vw, 38px); letter-spacing: -.03em; } p { margin: 0; color: var(--uiTextMuted); } .heroStatus { display: grid; align-content: center; justify-items: end; gap: 10px; color: var(--uiTextMuted); font-size: 12px; }
}
.workflowRail { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin-bottom: 14px; padding: 5px; border-bottom: 1px solid var(--uiBorderDefault); background: var(--uiSurfaceRaised); .workflowStep { display: grid; gap: 4px; min-height: 62px; padding: 8px 12px; border: 0; border-radius: 6px; color: var(--uiTextMuted); background: transparent; text-align: left; cursor: pointer; span { font: 10px ui-monospace, monospace; } strong { font-size: 12px; } small { color: var(--uiTextMuted); font-size: 10px; } &.active { color: var(--uiTextPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 8%, transparent); } &.current { color: var(--uiActionPrimary); box-shadow: inset 0 -2px var(--uiActionPrimary); } &.locked { cursor: not-allowed; opacity: .58; } &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: 1px; } }
}
.projectHero { align-items: center; margin-bottom: 10px; padding: 10px 0; border: 0; border-bottom: 1px solid var(--uiBorderDefault); border-radius: 0; background: transparent; .heroKicker { font-size: 10px; } p { margin-top: 5px; font-size: 11px; } }
.stageFocus { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px 24px; margin-bottom: 16px; padding: 7px 0 13px; border-bottom: 1px solid var(--uiBorderDefault); background: transparent; }
.stageFocusHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; .stageEyebrow, .panelEyebrow { color: var(--uiActionPrimary); font: 600 10px ui-monospace, monospace; } h3 { margin: 4px 0 3px; font-size: 17px; } p { max-width: 720px; margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } }
.stageStats { display: flex; align-items: center; justify-content: flex-end; gap: 18px; div { display: grid; gap: 3px; text-align: right; } strong { font-size: 14px; font-variant-numeric: tabular-nums; } span { color: var(--uiTextMuted); font-size: 10px; } }
.stageHint { grid-column: 1 / -1; color: var(--uiStatusWarning); font-size: 11px; line-height: 1.6; }
.stageSheet { max-width: 1200px; min-height: 380px; margin: 0 auto 20px; padding: 20px 22px; border: 1px solid var(--uiBorderDefault); border-radius: 8px; background: var(--uiSurfaceRaised); }
.stageSheetHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--uiBorderDefault); h3 { margin: 5px 0 4px; font-size: 18px; } p { max-width: 760px; margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } }
.assetTypeTabs { display: flex; gap: 4px; margin: 14px 0; border-bottom: 1px solid var(--uiBorderDefault); button { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 0; border-bottom: 2px solid transparent; color: var(--uiTextMuted); background: transparent; cursor: pointer; font-size: 12px; &.active { border-color: var(--uiActionPrimary); color: var(--uiActionPrimary); } span { color: inherit; font-size: 10px; } &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: -2px; } } }
.assetRecordList { display: grid; gap: 8px; }.assetRecord { display: grid; grid-template-columns: 34px minmax(0, 1fr) minmax(90px, auto) auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 6px; }.assetRecordMark { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid var(--uiBorderDefault); border-radius: 6px; color: var(--uiActionPrimary); font-size: 12px; }.assetRecordCopy { min-width: 0; strong, p, small { display: block; overflow: hidden; text-overflow: ellipsis; } strong { font-size: 12px; } p, small { margin: 4px 0 0; color: var(--uiTextMuted); font-size: 10px; white-space: nowrap; } }.assetScope { color: var(--uiTextMuted); font-size: 10px; }
.stageEmpty { display: grid; justify-items: center; gap: 8px; min-height: 160px; padding: 28px 16px; color: var(--uiTextMuted); text-align: center; strong { color: var(--uiTextPrimary); font-size: 13px; } span { max-width: 540px; font-size: 11px; line-height: 1.6; } }
.stageFooter { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--uiBorderDefault); span { color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } }
.scriptWorkbench { grid-template-columns: 250px minmax(0, 1fr); min-height: 560px; }.scriptWorkbench .workbenchSidebar { border-right: 1px solid var(--uiBorderDefault); border-bottom: 0; }.scriptReadingPane { display: flex; flex-direction: column; }.scriptReadingPane .stageFooter { margin-top: auto; }.episodeScriptContent { display: grid; gap: 18px; padding: 20px 4px; }.episodeScriptScene { display: grid; gap: 9px; padding-bottom: 16px; border-bottom: 1px solid var(--uiBorderDefault); > span { color: var(--uiActionPrimary); font-size: 11px; font-weight: 600; } > p { margin: 0; color: var(--uiTextMuted); font-size: 11px; } }.episodeScriptShot { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 5px 12px; padding: 10px 12px; border-left: 2px solid var(--uiBorderDefault); strong { color: var(--uiTextMuted); font-size: 10px; } p { margin: 0; font-size: 12px; line-height: 1.7; } p + p { grid-column: 2; color: var(--uiTextMuted); } }.scriptRecordNote { margin: 0; color: var(--uiTextMuted); font-size: 10px; line-height: 1.6; }
.readinessCallout { display: grid; gap: 4px; margin-bottom: 12px; padding: 10px 12px; border-left: 2px solid var(--uiStatusWarning); color: var(--uiTextMuted); background: color-mix(in srgb, var(--uiStatusWarning) 5%, transparent); font-size: 11px; line-height: 1.6; strong { color: var(--uiStatusWarning); font-size: 11px; } }
.videoTaskTabs { display: flex; gap: 6px; margin: 14px 0 0; padding-bottom: 8px; border-bottom: 1px solid var(--uiBorderDefault); button { display: grid; gap: 4px; min-width: 94px; padding: 9px 12px; border: 0; border-radius: 6px 6px 0 0; color: var(--uiTextMuted); background: transparent; text-align: left; cursor: pointer; &.active { color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 7%, transparent); box-shadow: inset 0 -2px var(--uiActionPrimary); } &:disabled { cursor: not-allowed; opacity: .55; } small { color: inherit; font-size: 10px; } } }
.deliveryActions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 16px 0; span { color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } }
.stageActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; .stageHint { color: var(--uiTextMuted); font-size: 11px; } }
.ideaInputShell { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px; border: 1px dashed var(--uiBorderDefault); border-radius: 12px; .uploadTile { display: grid; place-items: center; flex: 0 0 48px; width: 48px; height: 48px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; color: var(--uiTextBody); background: var(--uiBackgroundSubtle); cursor: pointer; &:hover, &:focus-visible { border-color: var(--uiActionPrimary); color: var(--uiActionPrimary); } }.uploadPrompt { display: grid; gap: 5px; strong { font-size: 12px; } span { color: var(--uiTextMuted); font-size: 11px; } }.hiddenFileInput { display: none; }.referenceFileList { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 8px; }.referenceFileChip { display: flex; align-items: center; gap: 7px; max-width: 100%; padding: 7px 8px 7px 11px; border: 1px solid var(--uiBorderDefault); border-radius: 9px; background: var(--uiBackgroundSubtle); > span { min-width: 0; max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; } small { color: var(--uiTextMuted); font-size: 10px; white-space: nowrap; } } }
.referenceStorageNote, .workflowPending { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.7; }.workflowPending { padding: 12px 14px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; background: var(--uiBackgroundSubtle); }
.scriptComposer { display: grid; gap: 20px; max-width: 1120px; margin: 0 auto 22px; padding: 28px; border: 1px solid color-mix(in srgb, var(--uiActionPrimary) 30%, var(--uiBorderDefault)); border-radius: 18px; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--uiActionPrimary) 7%, transparent), transparent 44%), var(--uiSurfaceRaised); }.scriptComposerHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 6px; h3 { margin: 8px 0 6px; font-size: clamp(24px, 3vw, 34px); letter-spacing: -.03em; } p { max-width: 680px; margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; } }.scriptModeTabs { display: flex; gap: 4px; width: fit-content; margin: 0 auto; padding: 5px; border: 1px solid var(--uiBorderDefault); border-radius: 999px; background: var(--uiBackgroundSubtle); button { min-width: 120px; padding: 10px 18px; border: 0; border-radius: 999px; color: var(--uiTextMuted); background: transparent; cursor: pointer; font-size: 12px; &.active { color: var(--uiTextOnAccent); background: var(--uiActionPrimary); } } }.scriptComposerGrid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }.scriptComposerMain { display: grid; gap: 16px; }.scriptComposerMain :deep(textarea) { min-height: 210px; }.scriptSettings { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; gap: 12px; padding: 15px; border: 1px solid var(--uiBorderDefault); border-radius: 11px; background: var(--uiBackgroundSubtle); }.scriptSettings > .panelEyebrow, .scriptSettings > p { grid-column: 1 / -1; }.scriptSettings p { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.7; }.scriptFilePicker { display: grid; gap: 5px; padding: 16px; border: 1px dashed color-mix(in srgb, var(--uiActionPrimary) 45%, var(--uiBorderDefault)); border-radius: 11px; color: var(--uiTextBody); background: color-mix(in srgb, var(--uiActionPrimary) 4%, transparent); cursor: pointer; input { width: 100%; color: var(--uiTextMuted); font-size: 11px; } small { color: var(--uiTextMuted); } }.scriptComposerActions, .scriptPreviewFooter { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.scriptPreview { display: grid; gap: 16px; padding-top: 18px; border-top: 1px solid var(--uiBorderDefault); }.scriptPreviewHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; strong { display: block; margin-top: 5px; font-size: 16px; } > span { color: var(--uiTextMuted); font-size: 11px; } }.scriptPreviewList { display: grid; gap: 12px; }.scriptPreviewEpisode { display: grid; gap: 10px; padding: 14px; border-bottom: 1px solid var(--uiBorderDefault); }.scriptPreviewScene { display: grid; gap: 9px; padding: 12px; border-left: 2px solid var(--uiBorderDefault); }.scriptPreviewShot { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 6px; strong { color: var(--uiActionPrimary); font-size: 12px; } }.scriptPreview > h4 { margin: 0; font-size: 14px; }.scriptAssetPreview { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; article { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 6px; } article > strong { color: var(--uiActionPrimary); font-size: 12px; } }.scriptPreviewFooter { align-items: flex-start; padding-top: 8px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }.storyboardToolbarActions { display: flex; gap: 8px; }
.stageWorkbench { display: grid; grid-template-columns: 214px minmax(0, 1fr) 248px; min-height: 400px; margin-bottom: 22px; overflow: hidden; border: 1px solid var(--uiBorderDefault); border-radius: 16px; background: var(--uiSurfaceRaised); }
.workbenchSidebar { min-width: 0; padding: 18px 12px; border-right: 1px solid var(--uiBorderDefault); background: color-mix(in srgb, var(--uiBackgroundSubtle) 55%, var(--uiSurfaceRaised)); }
.workbenchSidebarHeader, .workspaceHeader, .previewPanelHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }.workbenchSidebarHeader { padding: 0 6px 14px; border-bottom: 1px solid var(--uiBorderDefault); strong, .previewPanelHeader strong { display: block; margin-top: 5px; font-size: 14px; } }.sidebarHeaderActions { display: flex; align-items: center; gap: 6px; }
.episodeNavList { display: grid; gap: 5px; padding-top: 12px; }.episodeNavItem { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; padding: 10px 8px; border: 0; border-radius: 9px; color: var(--uiTextBody); background: transparent; text-align: left; cursor: pointer; &:hover, &.selected { background: color-mix(in srgb, var(--uiActionPrimary) 10%, transparent); } &.selected { box-shadow: inset 2px 0 var(--uiActionPrimary); } }.episodeNavIndex { align-self: start; color: var(--uiActionPrimary); font: 10px ui-monospace, monospace; }.episodeNavCopy { min-width: 0; display: grid; gap: 4px; strong, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { font-size: 12px; } small { color: var(--uiTextMuted); font-size: 10px; } }
.assetNav { display: grid; gap: 5px; margin-top: 22px; padding: 16px 6px 0; border-top: 1px solid var(--uiBorderDefault); }.assetNavTitle { margin-bottom: 5px; color: var(--uiTextMuted); font-size: 11px; }.assetNavItem { display: flex; justify-content: space-between; padding: 7px 8px; color: var(--uiTextMuted); font-size: 11px; strong { color: var(--uiTextPrimary); font-variant-numeric: tabular-nums; } }
.stageWorkspace { min-width: 0; padding: 18px 20px; }.workspaceHeader { align-items: center; padding-bottom: 14px; border-bottom: 1px solid var(--uiBorderDefault); h3 { margin: 5px 0 0; font-size: 17px; } }.workspaceHeaderMeta { display: flex; gap: 12px; color: var(--uiTextMuted); font-size: 11px; }
.storyboardWorkspace, .generationWorkspace, .reviewWorkspace, .approvalWorkspace, .deliveryWorkspace, .projectPrepWorkspace { padding-top: 15px; }.storyboardToolbar, .workspaceCallout { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--uiBorderDefault); strong, span, p { display: block; } strong { font-size: 13px; } span, p { margin: 4px 0 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } }
.generationActions, .candidateDockActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
.storyboardTable { overflow: auto; border: 1px solid var(--uiBorderDefault); border-radius: 10px; }.storyboardTableHeader, .storyboardTableRow { display: grid; grid-template-columns: 54px minmax(110px, 1fr) minmax(180px, 1.6fr) minmax(120px, 1fr) 76px 76px; align-items: center; gap: 12px; min-width: 820px; padding: 11px 12px; }.storyboardTableHeader { color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); font-size: 10px; }.storyboardTableRow { min-height: 67px; border-top: 1px solid var(--uiBorderDefault); font-size: 11px; &:hover { background: color-mix(in srgb, var(--uiActionPrimary) 5%, transparent); } strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { margin-top: 5px; color: var(--uiTextMuted); font-size: 10px; } }.storyboardShotNo { strong { color: var(--uiActionPrimary); font: 700 14px ui-monospace, monospace; } }.storyboardPrompt, .storyboardDirection { min-width: 0; }.storyboardActions { display: flex; justify-content: flex-end; }
.queueList { display: grid; gap: 8px; }.queueRow { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; }.queueIndex { color: var(--uiActionPrimary); font: 700 12px ui-monospace, monospace; }.queueRow strong, .queueRow small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.queueRow small { margin-top: 5px; color: var(--uiTextMuted); font-size: 10px; }
.candidateStrip { display: grid; grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)); gap: 10px; }.candidateDock { margin-bottom: 22px; padding: 14px; border: 1px solid var(--uiBorderDefault); border-radius: 14px; background: var(--uiSurfaceRaised); }.candidateDockHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }.candidateDockHeader strong { display: block; margin-top: 4px; font-size: 14px; }.candidateDockActions > span { color: var(--uiTextMuted); font-size: 11px; }.candidateDockList { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; }.candidateCard { display: grid; gap: 6px; min-width: 0; padding: 8px; border: 1px solid var(--uiBorderDefault); border-radius: 9px; }.candidateDockList .candidateCard { flex: 0 0 150px; color: var(--uiTextPrimary); background: transparent; text-align: left; cursor: pointer; }.candidateDockList .candidateCard:hover, .candidateDockList .candidateCard.selected { border-color: var(--uiActionPrimary); }.candidateDockList .candidateCard.selected { box-shadow: 0 0 0 1px var(--uiActionPrimary); }.candidateThumb { display: grid; place-items: center; aspect-ratio: 16 / 9; border-radius: 6px; color: var(--uiTextMuted); background: linear-gradient(135deg, color-mix(in srgb, var(--uiActionPrimary) 17%, #111), #101820); font-size: 10px; }.candidateThumb b { color: var(--uiTextPrimary); font-size: 18px; text-transform: uppercase; }.candidateCard strong, .candidateCard small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.candidateCard strong { font-size: 11px; }.candidateCard small { color: var(--uiTextMuted); font-size: 10px; }
.approvalBanner, .deliveryBanner { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; }.approvalMark { display: grid; flex: 0 0 30px; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-weight: 700; }.approvalBanner div, .deliveryBanner div { min-width: 0; flex: 1; }.approvalBanner p, .deliveryBanner p { margin: 5px 0 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }.approvalChecklist { display: grid; gap: 6px; margin-top: 14px; }.approvalChecklist > div { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 8px; padding: 9px; border-bottom: 1px solid var(--uiBorderDefault); font-size: 11px; }.approvalChecklist span { color: var(--uiTextMuted); &.done { color: var(--uiStatusSuccess); } }.approvalChecklist small { color: var(--uiTextMuted); }.deliveryFacts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }.deliveryFacts div { display: grid; gap: 5px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 9px; }.deliveryFacts strong { font-size: 16px; }.deliveryFacts span { color: var(--uiTextMuted); font-size: 10px; }
.prepGrid { display: grid; grid-template-columns: 1.4fr repeat(2, 1fr); gap: 10px; }.prepGrid > div { display: grid; align-content: center; gap: 6px; min-height: 120px; padding: 14px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; }.prepGrid p, .prepGrid span { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }.prepGrid strong { font-size: 16px; }
.previewPanel { min-width: 0; padding: 18px 14px; border-left: 1px solid var(--uiBorderDefault); background: color-mix(in srgb, var(--uiBackgroundSubtle) 60%, var(--uiSurfaceRaised)); }.previewPanelHeader { padding: 0 4px 14px; border-bottom: 1px solid var(--uiBorderDefault); }.previewFrame { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 220px; margin-top: 14px; border-radius: 10px; color: var(--uiTextMuted); background: linear-gradient(145deg, #0a1016, #101820); text-align: center; }.previewFrame strong { color: var(--uiTextPrimary); font-size: 12px; }.previewFrame span { font-size: 10px; }.previewGlyph { display: grid; place-items: center; width: 50px; height: 50px; border: 1px solid color-mix(in srgb, var(--uiActionPrimary) 55%, transparent); border-radius: 50%; color: var(--uiActionPrimary); font-size: 24px; }.previewMedia { display: grid; gap: 8px; margin-top: 14px; }.previewMedia video, .previewMedia img { width: 100%; max-height: 250px; border-radius: 9px; background: #000; object-fit: contain; }.previewMedia audio { width: 100%; }.previewMedia span { overflow: hidden; color: var(--uiTextMuted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.previewFooter { display: flex; align-items: center; gap: 8px; padding-top: 13px; color: var(--uiTextMuted); font-size: 10px; }.previewFooter strong { margin-right: auto; color: var(--uiTextPrimary); font-size: 14px; }.workbenchEmpty { padding: 18px 10px; color: var(--uiTextMuted); font-size: 11px; text-align: center; }.workbenchEmpty.large { padding: 50px 20px; border: 1px dashed var(--uiBorderDefault); border-radius: 9px; }
.supportGrid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
.mainColumn, .sideColumn { min-width: 0; display: grid; gap: 20px; align-content: start; }
.episodeBlock { border-top: 1px solid var(--uiBorderDefault); padding-top: 18px; margin-top: 18px; &:first-child { margin-top: 0; border-top: 0; padding-top: 0; } }
.episodeHeader { display: flex; align-items: center; justify-content: space-between; gap: 14px; .episodeNumber { color: var(--uiActionPrimary); font: 11px ui-monospace, monospace; } h3 { margin: 6px 0 0; font-size: 17px; } }
.shotList { display: grid; gap: 8px; margin-top: 16px; }
.shotRow { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; &:hover { border-color: color-mix(in srgb, var(--uiActionPrimary) 55%, var(--uiBorderDefault)); } .shotIndex { color: var(--uiActionPrimary); font: 700 13px ui-monospace, monospace; } .shotBody { min-width: 0; strong, span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { font-size: 13px; } span { margin-top: 4px; color: var(--uiTextMuted); font-size: 11px; } } .shotActions { display: flex; gap: 6px; } }
.addShotButton { margin-top: 14px; }
.budgetBlock { padding-bottom: 18px; border-bottom: 1px solid var(--uiBorderDefault); span, p { color: var(--uiTextMuted); font-size: 12px; } strong { display: block; margin: 8px 0 14px; font-size: 28px; small { font-size: 12px; font-weight: 400; color: var(--uiTextMuted); } } p { margin: 10px 0 0; line-height: 1.6; } .budgetMeter { height: 7px; overflow: hidden; border-radius: 99px; background: var(--uiBackgroundSubtle); i { display: block; height: 100%; border-radius: inherit; background: var(--uiActionPrimary); } } }
.memberList { display: grid; gap: 10px; padding-top: 16px; div { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; } } }
.auditSummary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; div { display: grid; gap: 5px; } strong { font-size: 24px; } span { color: var(--uiTextMuted); font-size: 11px; } } .sideHint { margin: 18px 0 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; } .deliveryItem { display: grid; gap: 7px; padding: 12px 0; border-bottom: 1px solid var(--uiBorderDefault); &:last-child { border-bottom: 0; } div { display: flex; justify-content: space-between; gap: 12px; } span, small { color: var(--uiTextMuted); font-size: 11px; } code { overflow-wrap: anywhere; color: var(--uiTextSecondary); font-size: 10px; }
}
.deliveryFiles { display: flex; flex-wrap: wrap; gap: 6px; }
.dialogForm { display: grid; gap: 16px; .dialogActions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; } .sectionHint { margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; } }
.reviewPanel { display: grid; gap: 16px; .reviewMeta { display: flex; align-items: center; justify-content: space-between; } .reviewPrompt { margin: 0; padding: 14px; border-radius: 10px; background: var(--uiBackgroundSubtle); line-height: 1.7; } .variantBox { display: grid; gap: 5px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; span { color: var(--uiTextMuted); font: 11px ui-monospace, monospace; overflow-wrap: anywhere; } .variantPreview { width: 100%; max-height: 280px; border-radius: 8px; background: #000; object-fit: contain; } } }
.assetRecord { cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; &:hover, &:focus-visible { border-color: color-mix(in srgb, var(--uiActionPrimary) 55%, var(--uiBorderDefault)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--uiActionPrimary) 12%, transparent); outline: none; } }
.assetRecordVisual { display: grid; place-items: center; overflow: hidden; aspect-ratio: 4 / 3; border-radius: 6px; background: var(--uiBackgroundSubtle); img { width: 100%; height: 100%; object-fit: cover; } }
.assetRecordPlaceholder { display: grid; place-items: center; gap: 5px; color: var(--uiTextMuted); text-align: center; span { color: var(--uiTextPrimary); font-size: 12px; } small { font-size: 10px; } }
.assetCardActions { display: flex; align-items: center; gap: 8px; }
.assetDetailLayout { display: grid; grid-template-columns: 190px minmax(0, 1fr) minmax(260px, 340px); min-height: 520px; overflow: hidden; border: 1px solid var(--uiBorderDefault); border-radius: 10px; }
.assetDetailList { min-width: 0; padding: 14px 10px; border-right: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle); }
.assetDetailListHeader, .assetDetailPreviewHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 12px; border-bottom: 1px solid var(--uiBorderDefault); strong { font-size: 12px; } }
.assetDetailListItem { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: center; gap: 8px; width: 100%; margin-top: 6px; padding: 7px; border: 0; border-radius: 7px; color: var(--uiTextBody); background: transparent; text-align: left; cursor: pointer; &:hover, &.active { background: color-mix(in srgb, var(--uiActionPrimary) 10%, transparent); } span:last-child { min-width: 0; } strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { font-size: 11px; } small { margin-top: 3px; color: var(--uiTextMuted); font-size: 10px; } }
.assetDetailMini { display: grid; place-items: center; overflow: hidden; aspect-ratio: 1; border-radius: 5px; color: var(--uiActionPrimary); background: var(--uiSurfaceRaised); font-size: 13px; img { width: 100%; height: 100%; object-fit: cover; } }
.assetDetailBody { min-width: 0; padding: 20px; header { padding-bottom: 16px; border-bottom: 1px solid var(--uiBorderDefault); } h3 { margin: 5px 0 6px; font-size: 20px; } header p { margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.65; } }
.assetDetailFields { display: grid; gap: 14px; margin: 16px 0; div { min-width: 0; } span { color: var(--uiTextMuted); font-size: 10px; } p { margin: 5px 0 0; white-space: pre-wrap; color: var(--uiTextBody); font-size: 12px; line-height: 1.7; } }
.assetDetailSettings { display: grid; grid-template-columns: 1fr 140px; gap: 12px; }
.assetImageQuote { margin: 0; padding: 10px 12px; border-radius: 7px; color: var(--uiTextBody); background: var(--uiBackgroundSubtle); font-size: 11px; strong { color: var(--uiActionPrimary); } }
.assetDetailActions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; }
.assetDetailPreview { min-width: 0; padding: 14px; border-left: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle); }
.assetDetailImage { display: grid; place-items: center; min-height: 360px; margin-top: 14px; overflow: hidden; border-radius: 8px; background: #080c10; img { width: 100%; max-height: 460px; object-fit: contain; } }
.assetDetailEmpty { display: grid; place-items: center; align-content: center; gap: 6px; min-height: 360px; margin-top: 14px; border-radius: 8px; color: var(--uiTextMuted); background: #080c10; text-align: center; span { color: var(--uiTextPrimary); font-size: 13px; } small { font-size: 10px; } }
.assetDetailPath { display: block; margin-top: 8px; overflow: hidden; color: var(--uiTextMuted); font: 10px ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 900px) { .assetDetailLayout { grid-template-columns: 160px minmax(0, 1fr); }.assetDetailPreview { grid-column: 1 / -1; border-top: 1px solid var(--uiBorderDefault); border-left: 0; }.assetDetailImage, .assetDetailEmpty { min-height: 260px; } }
@media (max-width: 620px) { .assetDetailLayout { grid-template-columns: 1fr; }.assetDetailList { max-height: 170px; overflow-y: auto; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); }.assetDetailBody { padding: 14px; }.assetDetailSettings { grid-template-columns: 1fr; }.assetDetailActions { flex-direction: column; align-items: stretch; } }
@media (max-width: 1100px) { .stageWorkbench { grid-template-columns: 190px minmax(0, 1fr) 220px; } }
@media (max-width: 860px) { .stageWorkbench { grid-template-columns: 1fr; } .workbenchSidebar, .previewPanel { border: 0; } .workbenchSidebar { border-bottom: 1px solid var(--uiBorderDefault); } .previewPanel { border-top: 1px solid var(--uiBorderDefault); } .workflowRail { overflow-x: auto; grid-template-columns: repeat(4, minmax(150px, 1fr)); } }
@media (max-width: 860px) { .scriptSettings { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .projectHero { display: grid; .heroStatus { justify-items: start; } } .scriptComposer { padding: 17px; }.scriptComposerHeader { display: grid; }.scriptModeTabs { width: 100%; button { flex: 1; min-width: 0; } }.scriptSettings { grid-template-columns: 1fr; }.scriptSettings > .panelEyebrow, .scriptSettings > p { grid-column: auto; }.scriptComposerActions, .scriptPreviewFooter { align-items: stretch; flex-direction: column; }.scriptComposerActions .uiButton, .scriptPreviewFooter .uiButton { width: 100%; }.shotRow { grid-template-columns: 30px minmax(0, 1fr); .uiTag, .shotActions { grid-column: 2; justify-self: start; } } }

.accountShell.immersive :deep(.accountMain .accountPageHeader) { margin-bottom: 12px; padding-bottom: 12px; }
.accountShell.immersive :deep(.accountMain .accountPageHeader h1) { font-size: 24px; line-height: 1.25; }
.accountShell.immersive :deep(.accountMain .accountPageHeader p) { margin-top: 6px; font-size: 11px; line-height: 1.5; }
.projectHero { margin-bottom: 8px; padding: 8px 0; }
.projectHero .heroKicker { overflow-wrap: anywhere; }
.workflowRail { display: flex; justify-content: center; width: fit-content; max-width: 100%; margin: 0 auto 10px; overflow-x: auto; border: 1px solid var(--uiBorderDefault); border-radius: 8px; }
.workflowStep { flex: 1 0 142px; }
.stageFocus { gap: 8px 20px; margin-bottom: 12px; padding: 2px 0 10px; }
.stageFocusHeader h3 { margin-top: 2px; }
.stageFocusHeader p { max-width: 900px; }
.stageStats { gap: 16px; }
.stageSheet { width: 100%; max-width: none; min-height: 420px; margin-bottom: 14px; padding: 18px 20px; box-sizing: border-box; }
.stageSheetHeader { align-items: center; padding-bottom: 12px; }
.assetTypeTabs { gap: 8px; margin: 12px 0 16px; overflow-x: auto; }
.assetTypeTabs button { flex: 0 0 auto; padding: 9px 12px; }
.assetRecordList { grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.assetRecord { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr) auto; align-items: start; gap: 12px; min-width: 0; min-height: 190px; padding: 14px; border-radius: 8px; background: color-mix(in srgb, var(--uiBackgroundSubtle) 38%, var(--uiSurfaceRaised)); }
.assetRecordMark { width: 32px; height: 32px; }
.assetRecordCopy { display: grid; align-content: start; gap: 7px; }
.assetRecordCopy p, .assetRecordCopy small { margin: 0; white-space: normal; line-height: 1.55; }
.assetRecordCopy p { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.assetRecordCopy small { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.assetRecordFooter { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 9px; border-top: 1px solid var(--uiBorderDefault); }
.stageFooter { position: sticky; bottom: 0; z-index: 2; margin-top: auto; padding: 12px 0 0; background: var(--uiSurfaceRaised); }
.scriptWorkbench { grid-template-columns: 250px minmax(0, 1fr); }
.storyboardWorkbench { grid-template-columns: 230px minmax(0, 1fr); }
.storyboardWorkbench .stageWorkspace { grid-column: 2; }
.storyboardTable { max-width: 100%; }
.videoWorkbench { grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr); }
.videoWorkbench > .stageWorkspace { grid-column: 1; }
.videoWorkbench > .previewPanel { grid-column: 2; }
.workspaceHeader { flex-wrap: wrap; align-items: center; }
.workspaceHeader > div:first-child { min-width: 0; }
.workspaceHeaderMeta { align-items: center; flex-wrap: wrap; }
.videoTaskTabs { max-width: 100%; overflow-x: auto; }
.videoTaskTabs button { flex: 0 0 auto; }
.storyboardToolbar, .deliveryActions { flex-wrap: wrap; }
.storyboardToolbarActions { flex-wrap: wrap; justify-content: flex-end; }
.queueRow { grid-template-columns: 34px minmax(0, 1fr) auto auto; }
.previewPanel { display: flex; flex-direction: column; }
.previewMedia video, .previewMedia img { max-height: 360px; }
.deliveryFacts { grid-template-columns: repeat(3, minmax(0, 1fr)); }

@media (max-width: 1100px) {
  .scriptWorkbench { grid-template-columns: 210px minmax(0, 1fr); }
  .storyboardWorkbench { grid-template-columns: 190px minmax(0, 1fr); }
  .videoWorkbench { grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr); }
}

@media (max-width: 860px) {
  .accountShell.immersive :deep(.accountMain) { padding-top: 16px; }
  .accountShell.immersive :deep(.accountMain .accountPageHeader) { flex-direction: row; align-items: center; gap: 12px; }
  .workflowRail { justify-content: flex-start; width: 100%; }
  .stageFocus { grid-template-columns: minmax(0, 1fr); }
  .stageStats { justify-content: flex-start; overflow-x: auto; }
  .stageWorkbench, .scriptWorkbench, .storyboardWorkbench, .videoWorkbench { grid-template-columns: minmax(0, 1fr); }
  .storyboardWorkbench .stageWorkspace, .videoWorkbench > .stageWorkspace, .videoWorkbench > .previewPanel { grid-column: 1; }
  .storyboardWorkbench .workbenchSidebar, .scriptWorkbench .workbenchSidebar { border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); }
}

@media (max-width: 620px) {
  .accountShell.immersive :deep(.accountMain .accountPageHeader) { align-items: flex-start; }
  .accountShell.immersive :deep(.accountMain .accountPageHeader h1) { font-size: 20px; }
  .accountShell.immersive :deep(.accountMain .accountPageHeader .headerActions) { gap: 4px; }
  .stageFocusHeader { flex-wrap: wrap; }
  .stageFocusHeader > div { min-width: 0; }
  .stageSheet { min-height: 0; padding: 14px; }
  .stageSheetHeader { align-items: flex-start; }
  .stageSheetHeader p { max-width: none; }
  .stageFooter { align-items: stretch; flex-direction: column; }
  .stageFooter .uiButton { width: 100%; }
  .assetRecordList { grid-template-columns: minmax(0, 1fr); }
  .assetRecord { min-height: 0; }
  .workspaceHeader { align-items: flex-start; }
  .workspaceHeaderMeta { width: 100%; }
  .storyboardToolbarActions { justify-content: flex-start; }
  .queueRow { grid-template-columns: 28px minmax(0, 1fr); }
  .queueRow > .uiTag, .queueRow > .uiButton { grid-column: 2; justify-self: start; }
  .deliveryFacts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .deliveryActions { align-items: stretch; flex-direction: column; }
  .deliveryItem > div { flex-wrap: wrap; }
}
</style>
