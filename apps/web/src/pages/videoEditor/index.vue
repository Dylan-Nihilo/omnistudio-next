<template>
  <main ref="editorRoot" class="videoEditor" :class="{ isExpanded: previewExpanded, inspectorOpen }" :style="{ '--agentWidth': `${agentWidth}px` }">
    <header class="editorHeader">
      <div class="headerProject">
        <button class="iconButton backButton" type="button" :aria-label="isProductionEditor ? '返回生产项目' : '返回画布'" @click="returnFromEditor"><icon-arrow-left :size="18" /></button>
        <div class="projectTitle"><strong>剪辑台</strong><span>{{ isProductionEditor ? productionEditorTitle || "生产项目" : workspaceStore.project?.name || "未命名项目" }}</span></div>
      </div>
      <div class="headerActions">
        <button class="secondaryButton projectPickerButton" type="button" :disabled="!directory || isProductionEditor && !boundProductionProjectPath || projectLoading || importBusy || sourceImportBusy || exportBusy || exportRecordBusy" @click="openEditorProjects">剪辑工程 · {{ editorProjectName }}</button>
        <span class="saveStatus" :class="{ hasError: saveError }" role="status">{{ saveError || (projectLoading ? "正在读取" : saveBusy || savePending ? "正在保存" : "已保存") }}</span>
        <button class="secondaryButton" type="button" :disabled="isProductionEditor && !boundProductionProjectPath || projectLoading || importBusy || sourceImportBusy || exportBusy || exportRecordBusy" @click="openRecovery">项目恢复</button>
        <button class="secondaryButton" type="button" :disabled="!projectReady" @click="openRenderQueue">渲染队列</button>
        <button v-if="lastExport" ref="deliveryButton" class="secondaryButton" type="button" @click="openDelivery">成片登记</button>
        <button class="exportButton" type="button" :disabled="!canExport || exportBusy || exportRecordBusy" @click="exportTimeline"><icon-download :size="16" />导出 MP4</button>
      </div>
    </header>
    <section v-if="!directory" class="noProject"><icon-movie :size="40" /><h1>{{ isProductionEditor ? "生产项目工作区尚未就绪" : "请先打开项目" }}</h1><button class="secondaryButton" @click="returnFromEditor">{{ isProductionEditor ? "返回生产项目" : "返回工作区" }}</button></section>
    <template v-else>
      <div v-if="draftAvailable" class="noticeBar" role="status"><span>发现尚未保存的本地草稿，恢复前会保留当前工程备份。</span><button :disabled="exportRecordBusy" @click="restoreDraft">恢复草稿</button><button :disabled="exportRecordBusy" @click="discardDraft">忽略草稿</button></div>
      <div v-if="sourceImportBusy || sourceImportError || sourceImportNotice" class="noticeBar" :class="{ errorNotice: sourceImportError }" :role="sourceImportError ? 'alert' : 'status'"><span>{{ sourceImportError || sourceImportNotice || sourceImportLabel }}</span><button v-if="sourceImportError" type="button" :disabled="sourceImportBusy || exportRecordBusy" @click="retrySourceImport">重试导入</button><button v-if="sourceImportError" type="button" @click="clearSourceImportQuery">关闭</button><button v-else-if="sourceImportNotice && !sourceImportBusy" type="button" aria-label="关闭素材导入提示" @click="sourceImportNotice = ''">关闭</button></div>
      <div v-if="saveBlocked" class="noticeBar errorNotice" role="alert"><span>项目已被其他窗口修改。当前编辑保留为本地草稿，请重新读取后选择是否恢复。</span><button @click="reloadProject">重新读取项目</button></div>
      <div v-if="saveRetryable" class="noticeBar errorNotice" role="alert"><span>{{ saveError }}当前更改已保留为本地草稿。</span><button type="button" :disabled="saveBusy" @click="saveProject">重试保存</button></div>
      <div v-if="canvasProjectCandidates.length" class="noticeBar errorNotice" role="alert"><span>这张画布对应多个已有剪辑工程，请从剪辑工程列表中选择要继续的版本。</span><button type="button" @click="openEditorProjects">选择剪辑工程</button></div>
      <div v-else-if="!projectReady && !projectLoading" class="noticeBar errorNotice" role="alert"><span>项目读取失败，已阻止覆盖原文件。{{ saveError }}</span><button v-if="isProductionEditor && !boundProductionProjectPath" :disabled="exportRecordBusy" @click="reloadProject">重新读取项目</button><button v-else :disabled="exportRecordBusy" @click="openRecovery">从备份恢复</button></div>
      <div v-if="exportRecordError && !lastExport" class="noticeBar errorNotice" role="alert"><span>{{ exportRecordError }}</span></div>
      <div v-if="exportError" class="noticeBar errorNotice" role="alert"><span>{{ exportError }}</span><button type="button" @click="exportError = ''">关闭</button></div>
      <div ref="editorWorkspace" class="editorWorkspace" :style="{ '--timelineHeight': `${timelineHeight}px` }">
        <div class="editorBody" :class="{ isUnavailable: !projectReady }">
          <aside class="mediaPanel" @dragover.prevent @drop.prevent="dropFiles">
            <nav class="sideNav" role="tablist" aria-label="剪辑工具" aria-orientation="vertical">
              <button v-for="(item, index) in panelTabs" :id="`${item.id}Tab`" :key="item.id" class="sideTab" :class="{ isActive: activeTab === item.id }" type="button" role="tab" :aria-selected="activeTab === item.id" aria-controls="editorAssetPanel" :tabindex="activeTab === item.id ? 0 : -1" @keydown="onPanelTabKeydown($event, index)" @click="activeTab = item.id"><component :is="item.icon" :size="20" /><span>{{ item.label }}</span></button>
            </nav>
            <section v-if="activeTab === 'media' || activeTab === 'audio'" id="editorAssetPanel" class="assetPanel" role="tabpanel" :aria-labelledby="`${activeTab}Tab`">
              <div class="panelHeading"><div><h2>{{ activeTab === 'audio' ? '音频素材' : '媒体素材' }}</h2><span>{{ assets.length }} 个文件</span></div><button class="tinyAction" aria-label="导入媒体" :disabled="!canEdit" @click="fileInput?.click()"><icon-plus :size="17" /></button></div>
              <input ref="fileInput" class="hiddenInput" type="file" accept="video/*,audio/*,image/png,image/jpeg,image/webp" multiple @change="importFiles" />
              <input ref="relinkInput" class="hiddenInput" type="file" accept="video/*,audio/*,image/png,image/jpeg,image/webp" @change="relinkFile" />
              <div class="importActions"><button class="importButton" type="button" :disabled="!canEdit" @click="fileInput?.click()"><icon-upload :size="16" />本地导入</button><button class="importButton" type="button" :disabled="!canEdit" @click="mediaPickerOpen = true"><icon-link :size="16" />项目 / 共享素材</button></div>
              <editorAudioMixer v-if="activeTab === 'audio'" :tracks="tracks" :disabled="!canEdit" :peakDb="audioPeakDb" :peakHoldDb="audioPeakHoldDb" @volume="changeTrackVolume" @toggle="toggleMixerTrack" />
              <div v-if="importBusy" class="assetHint" role="status">{{ importLabel }} {{ importProgress }}% <button @click="importController?.abort()">取消</button></div>
              <input v-model="assetSearch" class="assetSearch" type="search" aria-label="搜索素材" placeholder="搜索素材" />
              <div v-if="activeTab === 'media'" class="assetFilters"><button v-for="filter in mediaFilters" :key="filter.id" :class="{ isActive: mediaFilter === filter.id }" @click="mediaFilter = filter.id">{{ filter.label }}</button></div>
              <div class="assetList">
                <div v-for="asset in visibleAssets" :key="asset.id" class="assetRow" :class="{ isMissing: missingAssetIds.includes(asset.id), isSelected: sourceAssetId === asset.id }" :draggable="canEdit" @dragstart="dragAsset($event, asset)" @click="openSourceAsset(asset)" @dblclick.stop="openSourceAsset(asset)">
                  <span class="assetIcon" :class="asset.kind"><icon-music v-if="asset.kind === 'audio'" :size="18" /><icon-photo v-else-if="asset.kind === 'image'" :size="18" /><icon-video v-else :size="18" /></span>
                  <div class="assetInfo"><strong :title="asset.name">{{ asset.name }}</strong><span>{{ missingAssetIds.includes(asset.id) ? '素材缺失' : `${formatTime(asset.duration)} · ${formatBytes(asset.size)}` }}</span><span v-if="asset.source" :title="asset.source.path">{{ asset.source.type === 'production' ? `项目镜头 · 候选 ${asset.source.attemptNumber || 1}` : asset.source.canvasPath ? `画布 · ${asset.source.canvasPath}` : asset.source.type === 'library' ? '共享素材快照' : '工作区素材快照' }} · {{ asset.source.hash.slice(0, 8) }}</span></div>
                  <button class="tinyAction" type="button" :aria-label="`预览源素材 ${asset.name}`" title="预览源素材，设置入出点" @click.stop="openSourceAsset(asset)"><icon-player-play :size="14" /></button>
                  <button class="tinyAction" type="button" :aria-label="`重新链接 ${asset.name}`" title="重新链接素材" :disabled="!canEdit" @click.stop="chooseRelink(asset)"><icon-link :size="14" /></button>
                  <button class="tinyAction" type="button" :aria-label="`添加 ${asset.name} 到时间线`" :disabled="!canEdit || missingAssetIds.includes(asset.id)" @click.stop="addAssetToTimeline(asset)"><icon-plus :size="15" /></button>
                  <div v-if="asset.kind === 'video' || asset.kind === 'audio'" class="cacheControls" @click.stop>
                    <span class="cacheState" :class="{ hasError: cacheError(asset) }" :title="cacheStatusText(asset)">{{ cacheStatusText(asset) }}</span>
                    <button type="button" class="cacheButton" :disabled="!canEdit || missingAssetIds.includes(asset.id) || cacheBusyIds.has(asset.id) || cacheStatus(asset)?.state === 'processing'" @click="toggleMediaCache(asset)">{{ cacheActionText(asset) }}</button>
                    <button v-if="cachePreparingIds.has(asset.id)" type="button" class="cacheButton cancelCacheButton" @click="cancelMediaCache(asset)">取消</button>
                  </div>
                </div>
              </div>
              <button class="dropHint" :disabled="!canEdit" @click="fileInput?.click()">拖入视频 / 音频 / 图片 · 单文件最大 8 GiB</button>
            </section>
            <section v-else-if="activeTab === 'text'" id="editorAssetPanel" class="assetPanel textPanel" role="tabpanel" aria-labelledby="textTab">
              <div class="panelHeading"><div><h2>文字与字幕</h2><span>字幕支持 SRT / VTT</span></div></div>
              <label class="fieldLabel" for="textDraft">文字内容</label><textarea id="textDraft" v-model="textDraft" rows="5"></textarea><button class="wideButton" :disabled="!canEdit || !textDraft.trim()" @click="addTextClip">添加到文字轨</button>
              <input ref="subtitleInput" class="hiddenInput" type="file" accept=".srt,.vtt" @change="importSubtitles" />
              <button class="secondaryButton" :disabled="!canEdit" @click="subtitleInput?.click()">导入字幕</button>
              <div class="buttonRow"><button class="secondaryButton" :disabled="!clips.some(clip => clip.kind === 'text')" @click="exportSubtitles('srt')">导出 SRT</button><button class="secondaryButton" :disabled="!clips.some(clip => clip.kind === 'text')" @click="exportSubtitles('vtt')">导出 VTT</button></div>
            </section>
            <section v-else id="editorAssetPanel" class="assetPanel settingsPanel" role="tabpanel" aria-labelledby="settingsTab">
              <div class="panelHeading"><div><h2>项目与输出</h2><span>MP4 · H.264 / AAC</span></div></div>
              <label class="fieldLabel" for="aspectRatio">画面比例</label><select id="aspectRatio" :value="aspectRatio" :disabled="!canEdit" @change="changeSetting('aspectRatio', $event)"><option v-for="ratio in ['16:9', '9:16', '1:1', '4:3']" :key="ratio">{{ ratio }}</option></select>
              <label class="fieldLabel" for="frameRate">帧率</label><select id="frameRate" :value="frameRate" :disabled="!canEdit" @change="changeSetting('frameRate', $event)"><option v-for="fps in [24,25,30,60]" :key="fps" :value="fps">{{ fps }} fps</option></select>
              <label class="fieldLabel" for="exportHeight">输出高度</label><select id="exportHeight" :value="exportHeight" :disabled="!canEdit" @change="changeSetting('exportHeight', $event)"><option :value="720">720p</option><option :value="1080">1080p</option><option :value="2160">2160p · 4K</option></select>
              <label class="fieldLabel" for="exportQuality">输出质量</label><select id="exportQuality" :value="exportQuality" :disabled="!canEdit" @change="changeSetting('exportQuality', $event)"><option value="draft">快速预览</option><option value="standard">标准</option><option value="high">高质量</option></select>
              <input ref="edlInput" class="hiddenInput" type="file" accept=".edl,.txt" @change="importEdlFile" />
              <div class="buttonRow"><button class="secondaryButton" type="button" :disabled="!canEdit" @click="edlInput?.click()">导入 EDL</button><button class="secondaryButton" type="button" :disabled="!clips.some(clip => clip.kind === 'video' || clip.kind === 'image')" @click="exportEdlFile">导出 EDL</button></div>
              <p class="featureNote">画面等比适配。轨道从上到下对应画面上层到下层，空隙填充黑色。隐藏控制画面，静音控制声音。</p>
            </section>
          </aside>
          <section ref="previewArea" class="previewArea" aria-label="视频预览">
            <header class="monitorHeader">
              <span class="previewTitle">播放器</span>
              <nav class="monitorModes" aria-label="监视器布局">
                <button v-for="mode in monitorModes" :key="mode.id" type="button" :class="{ isActive: previewMode === mode.id }" :aria-pressed="previewMode === mode.id" :disabled="mode.id !== 'program' && !sourceAsset || mode.id === 'dual' && previewWidth < 720" @click="previewMode = mode.id">{{ mode.label }}</button>
              </nav>
              <button ref="inspectorButton" class="monitorAction inspectorToggle" type="button" :aria-expanded="inspectorOpen" aria-controls="editorInspector" @click="inspectorOpen = !inspectorOpen">属性</button>
              <button class="monitorAction agentToggle" type="button" :aria-expanded="agentVisible" aria-controls="agentPanel" :disabled="!projectReady" aria-label="AI 剪辑助手" title="AI 剪辑助手" @click="agentVisible = !agentVisible"><icon-message-circle :size="15" /></button>
              <button ref="expandButton" class="monitorAction" type="button" :aria-pressed="previewExpanded" @click="togglePreviewExpanded">{{ previewExpanded ? '恢复布局' : '放大预览' }}</button>
            </header>
            <div class="monitorGrid" :class="{ isDual: previewMode === 'dual' }">
              <section v-show="previewMode !== 'source'" class="programMonitor" aria-label="成片监视器">
                <div class="previewHost"><div ref="previewStage" class="previewStage" :style="stageStyle">
                  <template v-for="clip in activeVisualClips" :key="clip.id">
                    <editorText v-if="clip.kind === 'text'" :clip="clip" :width="textRenderSize.width" :height="textRenderSize.height" :style="{ opacity: textOpacity(clip) }" />
                    <img v-else-if="clip.kind === 'image'" class="previewVideo" :src="assetUrl(clip)" :style="visualStyle(clip)" alt="" @error="mediaFailed(clip)" />
                    <video v-else :ref="element => setVideoElement(clip.id, element)" class="previewVideo" :src="previewAssetUrl(clip)" :style="visualStyle(clip)" muted playsinline preload="auto" @loadedmetadata="syncPlayers" @error="mediaFailed(clip)"></video>
                  </template>
                  <audio v-for="clip in activeSoundClips" :key="clip.id" :ref="element => setAudioElement(clip.id, element)" class="hiddenAudio" :src="previewAssetUrl(clip)" preload="auto" @loadedmetadata="syncPlayers" @error="mediaFailed(clip)"></audio>
                  <div v-if="!clips.length" class="previewEmpty"><icon-movie :size="38" /><span>将素材添加到时间线</span></div>
                </div></div>
                <div v-if="previewError" class="previewAlert" role="alert">{{ previewError }}<button aria-label="关闭提示" @click="previewError = ''">×</button></div>
                <div class="transportBar">
                  <span class="transportTime">{{ formatTime(currentTime) }} / {{ formatTime(timelineDuration) }}</span>
                  <div class="transportButtons">
                  <button class="transportButton" aria-label="跳转到时间线开头" @click="seekTo(0)"><icon-player-skip-back :size="18" /></button>
                  <button class="transportButton" aria-label="上一帧" @click="stepFrame(-1)"><icon-player-track-prev :size="16" /></button>
                  <button class="transportButton" :aria-label="isPlaying ? '暂停' : '播放'" @click="togglePlayback"><icon-player-pause v-if="isPlaying" :size="21" /><icon-player-play v-else :size="21" /></button>
                  <button class="transportButton" aria-label="下一帧" @click="stepFrame(1)"><icon-player-track-next :size="16" /></button>
                  </div>
                  <select class="previewRatio" aria-label="画面比例" :value="aspectRatio" :disabled="!canEdit" @change="changeSetting('aspectRatio', $event)"><option v-for="ratio in ['16:9', '9:16', '1:1', '4:3']" :key="ratio">{{ ratio }}</option></select>
                </div>
              </section>
              <editorSource v-if="sourceAsset" v-show="previewMode !== 'program'" class="sourceMonitorPanel" :asset="sourceAsset" :url="sourceAssetUrl" :frameRate="frameRate" :disabled="!canEdit" :active="previewMode !== 'program' && !isPlaying" @focusin="stopPlayback" @insert="insertSourceSelection" />
            </div>
          </section>
          <aside id="editorInspector" class="inspectorPanel" aria-label="片段属性">
            <div class="panelHeading"><div><h2>片段属性</h2><span>{{ selectedClip?.title || '未选择片段' }}</span></div><button class="tinyAction inspectorClose" type="button" aria-label="关闭属性面板" @click="closeInspector">×</button></div>
            <template v-if="selectedClip">
              <p v-if="isLocked(selectedClip)" class="featureNote">此轨道已锁定，解锁后可以编辑。</p>
              <fieldset :disabled="!canEdit || isLocked(selectedClip)">
                <label class="fieldLabel" for="clipTrack">所在轨道</label><select id="clipTrack" :value="selectedClip.track" @change="moveSelectedTrack"><option v-for="track in tracks.filter(track => track.kind === clipTrackKind(selectedClip!) && !track.locked)" :key="track.id" :value="track.id">{{ track.label }}</option></select>
                <label class="fieldLabel" for="clipStart">时间线起点 <span>秒</span></label><input id="clipStart" type="number" min="0" :step="1 / frameRate" :value="roundNumber(selectedClip.start)" @change="updateSelectedClip('start', $event)" />
                <label class="fieldLabel" for="clipIn">入点 <span>源素材秒</span></label><input id="clipIn" type="number" min="0" :step="1 / frameRate" :value="roundNumber(selectedClip.inPoint)" @change="updateSelectedClip('inPoint', $event)" />
                <label class="fieldLabel" for="clipOut">出点 <span>源素材秒</span></label><input id="clipOut" type="number" min="0" :step="1 / frameRate" :value="roundNumber(selectedClip.outPoint)" @change="updateSelectedClip('outPoint', $event)" />
                <details class="precisionPanel" open>
                  <summary>精确剪辑</summary>
                  <label class="fieldLabel" for="precisionOperation">操作</label><select id="precisionOperation" v-model="precisionOperation"><option value="rippleIn">波纹入点</option><option value="rippleOut">波纹出点</option><option value="roll">滚动右切点</option><option v-if="selectedClip.kind === 'video' || selectedClip.kind === 'audio'" value="slip">滑移源素材</option></select>
                  <label class="fieldLabel" for="precisionFrames">偏移 <span>帧</span></label><input id="precisionFrames" v-model.number="precisionFrames" type="number" step="1" />
                  <div class="buttonRow"><button class="secondaryButton" type="button" @click="applyPrecisionEdit(-1)">−1 帧</button><button class="secondaryButton" type="button" @click="applyPrecisionEdit(1)">+1 帧</button><button class="secondaryButton" type="button" :disabled="!Number.isInteger(precisionFrames) || !precisionFrames" @click="applyPrecisionEdit(precisionFrames)">应用</button></div>
                  <p class="featureNote">{{ precisionDescription }}</p>
                </details>
                <template v-if="selectedClip.kind === 'video' || selectedClip.kind === 'audio'"><label class="fieldLabel" for="clipSpeed">播放速度</label><select id="clipSpeed" :value="selectedClip.speed ?? 1" @change="updateSelectedClip('speed', $event)"><option v-for="speed in [.25,.5,.75,1,1.25,1.5,2,3,4]" :key="speed" :value="speed">{{ speed }}×</option></select><label class="fieldLabel" for="clipVolume">基础音量 <span>{{ Math.round(selectedClip.volume * 100) }}%</span></label><input id="clipVolume" type="range" min="0" max="2" step=".01" :value="selectedClip.volume" @change="updateSelectedClip('volume', $event)" /><span v-if="selectedClip.keyframes?.some(frame => frame.property === 'volume')" class="featureNote">音量关键帧已接管基础音量。</span></template>
                <details v-if="selectedClipHasAudio" class="loudnessPanel" open>
                  <summary>响度校准</summary>
                  <label class="fieldLabel" for="clipGain">片段增益 <span>dB</span></label><input id="clipGain" type="number" min="-60" max="24" step=".1" :value="selectedClip.gainDb ?? 0" @change="updateSelectedClip('gainDb', $event)" />
                  <label class="fieldLabel" for="targetLoudness">目标响度</label><select id="targetLoudness" v-model.number="targetLoudness" :disabled="loudnessBusy"><option :value="-16">网络视频 · -16 LUFS</option><option :value="-14">音乐内容 · -14 LUFS</option><option :value="-23">广播参考 · -23 LUFS</option></select>
                  <button class="wideButton" type="button" :disabled="loudnessBusy || !canEdit || isLocked(selectedClip)" @click="analyzeSelectedAudio">{{ loudnessBusy ? '正在测量…' : '测量并校准片段' }}</button><button v-if="loudnessBusy" class="secondaryButton" type="button" @click="loudnessController?.abort()">取消测量</button>
                  <p class="featureNote">测量当前源选区，以恒定增益校准并限制真峰值至 -1 dBTP；原素材保持完整。</p>
                  <p v-if="loudnessNotice" class="featureNote" role="status">{{ loudnessNotice }}</p><p v-if="loudnessError" class="exportError" role="alert">{{ loudnessError }}</p>
                </details>
                <template v-if="selectedClip.kind === 'text'"><label class="fieldLabel" for="clipText">文字内容</label><textarea id="clipText" rows="4" :value="selectedClip.text" @change="updateSelectedText"></textarea><label class="fieldLabel" for="textColor">文字颜色</label><input id="textColor" type="color" :value="selectedClip.textColor ?? '#ffffff'" @change="updateTextColor" /><label v-for="field in textFields" :key="field.key" class="fieldLabel">{{ field.label }}<input type="number" :aria-label="field.label" :min="field.min" :max="field.max" :step="field.step" :value="selectedClip[field.key] ?? field.fallback" @change="updateSelectedClip(field.key, $event)" /></label></template>
                <template v-if="selectedClip.kind === 'video' || selectedClip.kind === 'image'"><details open><summary>画面变换</summary><label v-for="field in transformFields" :key="field.key" class="fieldLabel">{{ field.label }}<input type="number" :aria-label="field.label" :min="field.min" :max="field.max" :step="field.step" :value="selectedClip[field.key] ?? field.fallback" @change="updateSelectedClip(field.key, $event)" /></label></details><details><summary>基础调色</summary><label v-for="field in colorFields" :key="field.key" class="fieldLabel">{{ field.label }}<input type="number" :aria-label="field.label" :min="field.min" :max="field.max" :step="field.step" :value="selectedClip[field.key] ?? field.fallback" @change="updateSelectedClip(field.key, $event)" /></label></details></template>
                <label class="fieldLabel" for="clipOpacity">不透明度</label><input id="clipOpacity" type="range" min="0" max="1" step=".01" :value="selectedClip.opacity ?? 1" @change="updateSelectedClip('opacity', $event)" />
                <details v-if="availableKeyframeProperties.length" class="keyframePanel" open>
                  <summary>动画关键帧</summary>
                  <label class="fieldLabel" for="keyframeProperty">关键帧属性</label><select id="keyframeProperty" v-model="keyframeProperty"><option v-for="item in availableKeyframeProperties" :key="item.id" :value="item.id">{{ item.label }}</option></select>
                  <label class="fieldLabel" for="keyframeValue">{{ keyframePropertySpec.label }} <span>{{ keyframePosition === undefined ? "播放头未在片段内" : formatTime(keyframePosition) }}</span></label>
                  <input id="keyframeValue" type="number" :min="keyframePropertySpec.min" :max="keyframePropertySpec.max" :step="keyframePropertySpec.step" :value="keyframeValueDraft" :disabled="keyframePosition === undefined" @input="updateKeyframeDraft" />
                  <div class="buttonRow"><button class="secondaryButton" type="button" :disabled="!canPlaceKeyframe" @click="writeKeyframe">{{ currentPropertyKeyframe ? "更新关键帧" : "添加关键帧" }}</button><button class="secondaryButton" type="button" :disabled="!canPlaceKeyframe || !currentPropertyKeyframe" @click="removeCurrentKeyframe">删除当前</button></div>
                  <div class="keyframeNavigation"><button type="button" aria-label="上一关键帧" :disabled="!keyframeFrames.length" @click="navigateKeyframe(-1)"><icon-player-track-prev :size="14" /></button><span>{{ keyframeFrames.length }} 个点</span><button type="button" aria-label="下一关键帧" :disabled="!keyframeFrames.length" @click="navigateKeyframe(1)"><icon-player-track-next :size="14" /></button></div>
                  <div v-if="keyframeFrames.length" class="keyframeList"><div v-for="frame in keyframeFrames" :key="`${frame.property}:${frame.time}`" class="keyframeRow"><button type="button" class="keyframeJump" @click="seekTo(selectedClip.start + frame.time)">{{ formatTime(frame.time) }}<span>{{ roundNumber(frame.value) }}{{ keyframePropertySpec.unit }}</span></button><button type="button" class="keyframeRemove" :aria-label="`删除 ${formatTime(frame.time)} 关键帧`" @click="removeKeyframe(frame)">×</button></div></div>
                </details>
                <label class="fieldLabel" for="fadeIn">淡入 <span>秒</span></label><input id="fadeIn" type="number" min="0" :max="clipDuration(selectedClip)" step=".1" :value="selectedClip.fadeIn ?? 0" @change="updateSelectedClip('fadeIn', $event)" /><label class="fieldLabel" for="fadeOut">淡出 <span>秒</span></label><input id="fadeOut" type="number" min="0" :max="clipDuration(selectedClip)" step=".1" :value="selectedClip.fadeOut ?? 0" @change="updateSelectedClip('fadeOut', $event)" />
                <template v-if="selectedClip.kind === 'video' || selectedClip.kind === 'image'"><label class="fieldLabel" for="transitionIn">转场进入 <span>秒</span></label><input id="transitionIn" type="number" min="0" :max="clipDuration(selectedClip) / 2" step=".1" :value="selectedClip.transitionIn ?? 0" @change="updateSelectedClip('transitionIn', $event)" /><label class="fieldLabel" for="transitionOut">转场离开 <span>秒</span></label><input id="transitionOut" type="number" min="0" :max="clipDuration(selectedClip) / 2" step=".1" :value="selectedClip.transitionOut ?? 0" @change="updateSelectedClip('transitionOut', $event)" /><div class="buttonRow"><button class="secondaryButton" type="button" @click="applyCrossfade">应用交叉淡化</button><button class="secondaryButton" type="button" @click="clearCrossfade">清除转场</button></div></template>
                <div class="inspectorFooter"><span>时间线时长</span><strong>{{ formatTime(clipDuration(selectedClip)) }}</strong></div><button class="removeButton" @click="deleteSelectedClip"><icon-trash :size="16" />删除片段</button>
              </fieldset>
            </template>
            <div v-else class="inspectorEmpty"><icon-adjustments :size="27" /><span>选择片段查看属性</span></div>
          </aside>
        </div>
        <div class="timelineSeparator" role="separator" tabindex="0" aria-label="调整时间线高度" aria-orientation="horizontal" aria-controls="editorTimeline" :aria-valuemin="220" :aria-valuemax="timelineMaxHeight" :aria-valuenow="Math.round(timelineHeight)" @pointerdown="startTimelineResize" @pointermove="moveTimelineResize" @pointerup="stopTimelineResize" @pointercancel="stopTimelineResize" @lostpointercapture="stopTimelineResize" @keydown="onTimelineResizeKeydown"></div>
        <section id="editorTimeline" class="timelinePanel" :class="{ isCompact: timelineHeight < 260 }" aria-label="多轨时间线">
          <header class="timelineHeader"><div class="timelineActions">
            <button class="timelineButton" aria-label="撤销" :disabled="!canEdit || !undoStack.length" @click="undo"><icon-arrow-back-up :size="17" /></button><button class="timelineButton" aria-label="重做" :disabled="!canEdit || !redoStack.length" @click="redo"><icon-arrow-forward-up :size="17" /></button>
            <button class="timelineButton" aria-label="分割片段" :disabled="!canEdit || !selectedClip || isLocked(selectedClip)" @click="splitSelectedClip"><icon-scissors :size="17" /></button><button class="timelineButton" aria-label="复制片段" :disabled="!canEdit || !selectedClip || isLocked(selectedClip)" @click="duplicateSelectedClip"><icon-copy :size="17" /></button><button class="timelineButton" aria-label="删除片段" :disabled="!canEdit || !selectedClip || isLocked(selectedClip)" @click="deleteSelectedClip"><icon-trash :size="17" /></button>
            <button class="trackAdd" type="button" title="Shift + Delete" :disabled="!canEdit || !selectedClip || isLocked(selectedClip)" @click="rippleDeleteSelected">波纹删除</button>
            <select v-model="editMode" class="editMode" aria-label="时间线编辑模式"><option value="select">选择 V</option><option value="ripple">波纹修剪 B</option><option value="roll">滚动 N</option><option value="slip">滑移 Y</option></select>
            <button class="timelineButton snapButton" :class="{ isActive: snapEnabled }" :aria-pressed="snapEnabled" @click="snapEnabled = !snapEnabled"><icon-magnet :size="16" />吸附</button><span class="headerDivider"></span>
            <button v-for="kind in trackKinds" :key="kind.id" class="trackAdd" :disabled="!canEdit" @click="addTrack(kind.id)">+ {{ kind.label }}轨</button>
          </div><div class="timelineZoom"><label>缩放 <input v-model.number="zoom" type="range" min=".2" max="100" step=".2" aria-label="时间线缩放" /></label><button class="trackAdd" @click="fitTimeline">适合全长</button></div></header>
          <div v-if="editError" class="editNotice" role="alert"><span>{{ editError }}</span><button type="button" aria-label="关闭剪辑提示" @click="editError = ''">×</button></div>
          <div ref="timelineViewport" class="timelineViewport" @scroll.passive="updateTimelineViewport"><div class="timelineCanvas" :style="{ width: `${timelineWidth}px` }">
            <div class="timelineRuler" @pointerdown="seekTimeline"><div class="rulerLabel">时间</div><div class="rulerTicks"><span v-for="tick in rulerTicks" :key="tick" class="rulerTick" :style="{ left: `${tick * zoom}px` }">{{ formatTime(tick) }}</span></div></div>
            <div v-for="(track, index) in tracks" :key="track.id" class="timelineTrack" :class="[track.kind, { isLocked: track.locked, isHidden: track.hidden }]" :data-track-id="track.id" @pointerdown="seekTimeline" @dragover.prevent @drop.prevent="dropOnTrack($event, track)">
              <div class="trackLabel" @pointerdown.stop><div class="trackName"><input :value="track.label" :aria-label="`轨道名称 ${track.label}`" :disabled="!canEdit || track.locked" @change="renameTrack(track, $event)" /><small>{{ clips.filter(clip => clip.track === track.id).length }}</small></div><div class="trackControls">
                <button :aria-label="`${track.locked ? '解锁' : '锁定'} ${track.label}`" :aria-pressed="track.locked" :disabled="!canEdit" @click="toggleTrack(track, 'locked')">{{ track.locked ? '锁' : '锁定' }}</button><button v-if="track.kind !== 'audio'" :aria-label="`${track.hidden ? '显示' : '隐藏'} ${track.label}`" :aria-pressed="track.hidden" :disabled="!canEdit || track.locked" @click="toggleTrack(track, 'hidden')">{{ track.hidden ? '显' : '隐藏' }}</button><button v-if="track.kind !== 'text'" :aria-label="`${track.muted ? '取消静音' : '静音'} ${track.label}`" :aria-pressed="track.muted" :disabled="!canEdit || track.locked" @click="toggleTrack(track, 'muted')">{{ track.muted ? '有声' : '静音' }}</button><button :aria-label="`上移 ${track.label}`" :disabled="!canEdit || track.locked || index === 0" @click="reorderTrack(index, -1)">↑</button><button :aria-label="`下移 ${track.label}`" :disabled="!canEdit || track.locked || index === tracks.length - 1" @click="reorderTrack(index, 1)">↓</button><button :aria-label="`删除轨道 ${track.label}`" :disabled="!canEdit || track.locked" @click="removeTrack(track)">×</button>
              </div></div>
              <div class="trackContent">
                <button v-for="clip in clips.filter(item => item.track === track.id)" :key="clip.id" class="timelineClip" :class="[clip.kind, { isSelected: selectedClipId === clip.id }]" :style="clipStyle(clip)" :title="`${clip.title} · ${formatTime(clipDuration(clip))}`" :aria-label="`片段 ${clip.title}`" @pointerdown.stop="startClipDrag($event, clip)" @click.stop="selectClip(clip)">
                  <editorFilmstrip v-if="clip.kind === 'video' || clip.kind === 'image'" :source="assetUrl(clip)" :kind="clip.kind" :inPoint="clip.inPoint" :outPoint="clip.outPoint" :speed="clip.speed ?? 1" :start="clip.start" :zoom="zoom" :frameRate="frameRate" :thumbnailSprite="cachedMediaById.get(clip.assetId ?? '')?.thumbnailSprite" :viewportLeft="timelineView.left" :viewportWidth="timelineView.width" :generator="thumbnailGenerator" />
                  <editorAudioWaveform v-if="(clip.kind === 'audio' || (clip.kind === 'video' && assets.find(asset => asset.id === clip.assetId)?.hasAudio)) && waveformForClip(clip)" :peaks="waveformForClip(clip)!.peaks" :duration="waveformForClip(clip)!.duration" :inPoint="clip.inPoint" :outPoint="clip.outPoint" :speed="clip.speed ?? 1" :start="clip.start" :zoom="zoom" :viewportLeft="timelineView.left" :viewportWidth="timelineView.width" />
                  <span class="clipTitle">{{ clip.title }}</span><span class="clipDuration">{{ formatTime(clipDuration(clip)) }}</span>
                  <span class="trimHandle leftHandle" role="presentation" @pointerdown.stop.prevent="startClipDrag($event, clip, 'left')"></span><span class="trimHandle rightHandle" role="presentation" @pointerdown.stop.prevent="startClipDrag($event, clip, 'right')"></span>
                </button>
              </div>
            </div>
            <div class="playhead" :style="{ left: `${trackLabelWidth + currentTime * zoom}px` }" @pointerdown.stop="startPlayheadDrag"><span class="playheadCap"></span><span class="playheadLine"></span></div>
          </div></div>
          <footer class="timelineFooter"><span>{{ tracks.length }} 轨 · {{ clips.length }} 个片段</span><span class="timelineFooterNote">{{ editMode === 'select' ? 'V 选择 · B 波纹修剪 · N 滚动 · Y 滑移 · Shift Delete 波纹删除' : editMode === 'slip' ? '拖动片段整体滑移源范围，时间线位置保持不变 · V 返回选择' : '拖动片段边缘执行修剪 · V 返回选择' }} · 空格 播放 · ← → 逐帧 · S 分割 · Ctrl Z 撤销</span><span>总时长 {{ formatTime(timelineDuration) }}</span></footer>
        </section>
      </div>
    </template>
    <dialog ref="deliveryDialog" class="deliveryDialog" aria-label="成片登记与画布回写" @close="deliveryButton?.focus()">
      <header class="deliveryHeader"><strong>成片登记与画布回写</strong><button class="secondaryButton" type="button" @click="deliveryDialog?.close()">关闭</button></header>
      <editorDelivery v-if="lastExport" :result="lastExport" :initialProjectId="queryString(route.query.productionProjectId)" :initialEpisodeId="queryString(route.query.episodeId)" :disabled="!canRegisterExport || exportRecordBusy"><template #extraActions><button v-if="returnCanvasPath" class="secondaryButton" type="button" :disabled="!canRegisterExport || exportRecordBusy" @click="returnExportToCanvas">回写来源画布</button></template></editorDelivery>
      <p v-if="exportRecordError" class="exportError" role="alert">{{ exportRecordError }}<button v-if="lastExport && !exportRecordSaved" class="secondaryButton" type="button" :disabled="exportRecordBusy || !canRegisterExport" @click="persistLastExport">{{ exportRecordBusy ? '正在保存记录…' : '重试保存导出记录' }}</button></p>
      <p v-else-if="exportRecordBusy" class="exportStale" role="status">正在核验导出记录…</p>
      <p v-else-if="lastExport && exportRecordSaved" class="exportStale" role="status">导出记录已保存，重新打开此工程后可继续登记与回写。</p>
      <p v-if="lastExport && !canRegisterExport" class="exportStale" role="status">工程已变更或正在保存，请重新导出后登记与回写。</p>
    </dialog>
    <editorMediaPicker v-if="directory" v-model:open="mediaPickerOpen" :directory="directory" :disabled="!canEdit" @import="importPickedMedia" />
    <dialog v-if="directory && projectContext" ref="renderQueueDialog" class="renderQueueDialog" aria-label="后台渲染队列"><header class="renderDialogHeader"><strong>后台渲染</strong><button class="secondaryButton" type="button" @click="renderQueueDialog?.close()">关闭</button></header><editorRenderQueue :directory="directory" :projectPath="projectContext.projectPath" :revision="renderProjectRevision" :refreshKey="renderQueueRefreshKey" :disabled="!!sessionInvalidated" @completed="completeEditorRender" @useResult="useEditorRenderResult" /></dialog>
    <div v-if="recoveryOpen" class="exportOverlay" role="dialog" aria-modal="true" aria-label="项目恢复" @keydown.esc.stop="recoveryOpen = false"><div class="recoveryDialog"><h2>项目恢复</h2><p>恢复时会先备份当前文件，素材文件不会删除。</p><label class="fieldLabel" for="backupChoice">历史备份</label><select id="backupChoice" v-model="selectedBackup" :disabled="recoveryLoading || exportRecordBusy"><option value="" disabled>选择备份时间</option><option v-for="backup in backups" :key="backup.path" :value="backup.path">{{ backup.name }}</option></select><span v-if="recoveryLoading">正在读取备份…</span><span v-else-if="!backups.length">暂无工程备份</span><div class="buttonRow"><button class="secondaryButton" :disabled="exportRecordBusy" @click="recoveryOpen = false">关闭</button><button class="exportButton" :disabled="!selectedBackup || projectLoading || recoveryLoading || exportRecordBusy" @click="restoreBackup">恢复所选备份</button></div><p v-if="recoveryError" class="exportError" role="alert">{{ recoveryError }}</p></div></div>
    <div v-if="editorProjectsOpen" class="exportOverlay" role="dialog" aria-modal="true" aria-label="剪辑工程管理" @keydown.esc.stop="editorProjectsOpen = false">
      <div class="recoveryDialog editorProjectsDialog">
        <h2>剪辑工程</h2>
        <p>{{ canvasProjectCandidates.length ? "这张画布关联了多个旧剪辑工程，请选择要继续的工程。" : "每个剪辑工程拥有独立时间线与恢复备份，素材文件按版本保存在当前工作区。" }}</p>
        <label class="fieldLabel" for="newEditorProjectName">新建工程</label>
        <div class="projectCreateRow">
          <input id="newEditorProjectName" v-model.trim="newEditorProjectName" maxlength="120" placeholder="输入剪辑工程名称" :disabled="exportRecordBusy" @keydown.enter.prevent="createEditorProjectFromDialog" />
          <button class="exportButton" :disabled="!newEditorProjectName || projectBusy || exportRecordBusy" @click="createEditorProjectFromDialog">新建</button>
        </div>
        <div v-if="editorProjectOptions.length" class="editorProjectList">
          <button v-for="item in editorProjectOptions" :key="item.path" type="button" class="editorProjectChoice" :class="{ isCurrent: projectReady && item.path === activeEditorProjectPath }" :disabled="projectBusy || exportRecordBusy || projectReady && item.path === activeEditorProjectPath" @click="selectEditorProject(item.path)">
            <span class="projectChoiceInfo"><strong :title="item.name">{{ item.name }}</strong><small :title="item.path">{{ item.path }}</small></span>
            <span class="projectChoiceState">{{ projectReady && item.path === activeEditorProjectPath ? '当前工程' : '打开' }}</span>
          </button>
        </div>
        <p v-if="projectError" class="exportError" role="alert">{{ projectError }}</p>
        <div class="buttonRow"><button class="secondaryButton" :disabled="exportRecordBusy" @click="editorProjectsOpen = false">关闭</button></div>
      </div>
    </div>
    <div v-if="exportBusy" class="exportOverlay" role="status" aria-live="polite"><div class="exportDialog"><div class="exportSpinner"></div><strong>{{ exportSubmitting ? '正在提交后台渲染任务' : exportController?.signal.aborted ? '正在停止任务准备' : '正在准备渲染任务' }}</strong><span>{{ exportProgress === undefined ? '正在校验与准备素材' : `${exportProgress}%` }}</span><div class="progressTrack"><i :style="{ width: `${exportProgress ?? 4}%` }"></i></div><button class="secondaryButton" :disabled="exportSubmitting || exportController?.signal.aborted" @click="exportController?.abort()">取消准备</button></div></div>
    <floatingAgent v-model="agentVisible" :topOffset="48" @resize="agentWidth = $event" />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router";
import { isSameDirectory, useWorkspaceStore } from "@/stores/workspace";
import { useAuthStore } from "@/stores/auth";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { getSessionSnapshot, sessionInvalidated } from "@/lib/sessionState";
import { clipDuration, clipKeyframeValue, createDefaultTracks, crossfadeDuration, parseEditorProject, parseSubtitles, serializeSubtitles, sliceClipKeyframes, trackAudioEnabled, type EditorAsset, type EditorClip, type EditorKeyframe, type EditorKeyframeProperty, type EditorProject, type EditorTrack, type MediaKind, type TrackKind } from "./editorModel";
import { backupEditorContent, bindCanvasEditorProject, bindProductionEditorProject, createEditorProject as createEditorProjectFile, ensureEditorFolders, loadEditorProject, listEditorBackups, listEditorProjects, pruneEditorBackups, readEditorBackup, resolveCanvasEditorProject, resolveProductionEditorProject, saveEditorProject } from "./editorProject";
import { exportEditorProject, type EditorRenderJob } from "./editorExport";
import { exportEdl, importEdl } from "./editorExchange";
import { insertClipAtTime, rippleDeleteClip, rippleTrimClip, rollEditClips, slipEditClip } from "./editorTimeline";
import { createTimelineThumbnailGenerator } from "./editorThumbnails";
import { canvasSchemas, type CanvasContext } from "@omnistudio-next/tool-canvas/runtime";
import type { ApiResponse } from "@/lib/authApi";
import editorAudioWaveform from "./editorAudioWaveform.vue";
import editorAudioMixer from "./editorAudioMixer.vue";
import editorFilmstrip from "./editorFilmstrip.vue";
import editorMediaPicker from "./editorMediaPicker.vue";
import editorDelivery from "./editorDelivery.vue";
import editorSource from "./editorSource.vue";
import editorText from "./editorText.vue";
import editorRenderQueue from "./editorRenderQueue.vue";
import floatingAgent from "../workspace/components/floatingAgent.vue";
import { IconAdjustments, IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconCopy, IconDownload, IconLink, IconMagnet, IconMessageCircle, IconMovie, IconMusic, IconPhoto, IconPhotoVideo, IconPlayerPause, IconPlayerPlay, IconPlayerSkipBack, IconPlayerTrackNext, IconPlayerTrackPrev, IconPlus, IconScissors, IconTextSize, IconTrash, IconUpload, IconVideo } from "@tabler/icons-vue";

type ProjectContext = { directory: string; projectPath: string; revision: string; content: string; draftKey: string; sequence: number; blocked: boolean };
type PendingSave = { context: ProjectContext; project: EditorProject; sequence: number };
type EditorExportRecord = { id: string; projectPath: string; revision: string; exportPath: string };
type DragState = { clipId?: string; element?: HTMLElement; startX: number; startY: number; start?: number; inPoint?: number; outPoint?: number; keyframes?: EditorKeyframe[]; edge?: "left" | "right"; playhead?: boolean; historySaved?: boolean; mode?: "select" | "ripple" | "roll" | "slip"; clips?: EditorClip[]; track?: string };
type EditorCacheStatus = { state: "missing" | "stale" | "processing" | "ready"; proxyPath?: string; thumbnails?: { path: string; width: number; height: number; columns: number; rows: number; count: number; step: number; padding: number; margin: number }; waveform?: { path: string; duration?: number; peaks: number[] }; duration?: number };
type EditorCacheEntry = { path: string; status: EditorCacheStatus };
type CachedMedia = { proxyUrl?: string; thumbnailSprite?: { url: string; width: number; height: number; columns: number; rows: number; count: number; step: number; padding: number; margin: number }; waveform?: { duration: number; peaks: number[] } };
type NumericField = "start" | "inPoint" | "outPoint" | "volume" | "gainDb" | "speed" | "x" | "y" | "scale" | "rotation" | "opacity" | "brightness" | "contrast" | "saturation" | "fadeIn" | "fadeOut" | "transitionIn" | "transitionOut" | "fontSize" | "textX" | "textY";
type AudioLoudnessResult = { integratedLufs: number; truePeakDb: number; targetLufs: number; gainDb: number; expectedLufs: number; limited: boolean; hash: string };
type ProductionEditorPayload = { project: { id: string; title: string }; episodes: { id: string; title: string }[] };
const router = useRouter();
const route = useRoute();
const workspaceStore = useWorkspaceStore();
const authStore = useAuthStore();
const productionProjectId = computed(() => queryString(route.query.productionProjectId));
const productionEpisodeId = computed(() => queryString(route.query.episodeId));
const productionBindingKey = computed(() => JSON.stringify([route.query.productionProjectId !== undefined, route.query.episodeId !== undefined, route.query.productionProjectId, route.query.episodeId]));
const isProductionEditor = computed(() => route.query.productionProjectId !== undefined || route.query.episodeId !== undefined);
const directory = computed(() => isProductionEditor.value ? authStore.personalDirectory || undefined : workspaceStore.project?.directory);
const productionEditorTitle = ref("");
const legacyEditorProjectPath = "assets/videoEditor/timeline.json";
const trackLabelWidth = 174;
const panelTabs = [{ id: "media", label: "媒体", icon: IconPhotoVideo }, { id: "audio", label: "音频", icon: IconMusic }, { id: "text", label: "文字", icon: IconTextSize }, { id: "settings", label: "设置", icon: IconAdjustments }] as const;
const mediaFilters = [{ id: "all", label: "全部" }, { id: "video", label: "视频" }, { id: "audio", label: "音频" }, { id: "image", label: "图片" }] as const;
const trackKinds = [{ id: "video", label: "视频" }, { id: "audio", label: "音频" }, { id: "text", label: "文字" }] as const;
const transformFields = [
  { key: "x", label: "水平偏移 %", min: -200, max: 200, step: 1, fallback: 0 },
  { key: "y", label: "垂直偏移 %", min: -200, max: 200, step: 1, fallback: 0 },
  { key: "scale", label: "缩放倍数", min: .1, max: 5, step: .05, fallback: 1 },
  { key: "rotation", label: "旋转角度", min: -360, max: 360, step: 1, fallback: 0 },
] as const;
const keyframeProperties = [
  { id: "x", label: "水平位置 X", min: -200, max: 200, step: 1, unit: "%" },
  { id: "y", label: "垂直位置 Y", min: -200, max: 200, step: 1, unit: "%" },
  { id: "opacity", label: "不透明度", min: 0, max: 1, step: .01, unit: "" },
  { id: "volume", label: "音量", min: 0, max: 2, step: .01, unit: "×" },
] as const;
const colorFields = [{ key: "brightness", label: "亮度", min: 0, max: 3, step: .05, fallback: 1 }, { key: "contrast", label: "对比度", min: 0, max: 3, step: .05, fallback: 1 }, { key: "saturation", label: "饱和度", min: 0, max: 3, step: .05, fallback: 1 }] as const;
const textFields = [{ key: "fontSize", label: "字号 / 画宽 %", min: 1, max: 20, step: .5, fallback: 4 }, { key: "textX", label: "文字水平位置 %", min: 0, max: 100, step: 1, fallback: 50 }, { key: "textY", label: "文字垂直位置 %", min: 0, max: 100, step: 1, fallback: 90 }] as const;
const activeTab = ref<"media" | "audio" | "text" | "settings">("media");
const agentVisible = ref(false);
const agentWidth = ref(0);
const agentUndoPoint = shallowRef<{ projectPath: string; before: string; after: string }>();
const monitorModes = [{ id: "program", label: "成片" }, { id: "source", label: "素材源" }, { id: "dual", label: "双监视器" }] as const;
const previewMode = ref<"program" | "source" | "dual">("program");
const lastSingleMonitor = ref<"program" | "source">("program");
const previewWidth = ref(0);
const previewExpanded = ref(false);
const inspectorOpen = ref(false);
const editorRoot = ref<HTMLElement>();
const editorWorkspace = ref<HTMLElement>();
const previewArea = ref<HTMLElement>();
const expandButton = ref<HTMLButtonElement>();
const inspectorButton = ref<HTMLButtonElement>();
const deliveryButton = ref<HTMLButtonElement>();
const deliveryDialog = ref<HTMLDialogElement>();
const timelineHeight = ref(220);
const timelineMaxHeight = ref(420);
let preferredTimelineHeight: number | undefined;
let timelineResizeDrag: { y: number; height: number; pointerId: number; element: HTMLElement } | undefined;
let workspaceResizeObserver: ResizeObserver | undefined;
let previewResizeObserver: ResizeObserver | undefined;
const sourceAssetId = ref<string>();
const editMode = ref<"select" | "ripple" | "roll" | "slip">("select");
const precisionOperation = ref<"rippleIn" | "rippleOut" | "roll" | "slip">("rippleOut");
const precisionFrames = ref(1);
const editError = ref("");
const mediaFilter = ref<"all" | MediaKind>("all");
const assets = ref<EditorAsset[]>([]);
const cacheStates = ref(new Map<string, EditorCacheEntry>());
const cacheErrors = ref(new Map<string, { path: string; message: string }>());
const cacheBusyIds = ref(new Set<string>());
const cachePreparingIds = ref(new Set<string>());
const clips = ref<EditorClip[]>([]);
const tracks = ref<EditorTrack[]>(createDefaultTracks());
const aspectRatio = ref("16:9");
const frameRate = ref(30);
const exportHeight = ref<EditorProject["exportHeight"]>(1080);
const exportQuality = ref<EditorProject["exportQuality"]>("standard");
const selectedClipId = ref<string>();
const currentTime = ref(0);
const keyframeProperty = ref<EditorKeyframeProperty>("x");
const keyframeValueDraft = ref(0);
const isPlaying = ref(false);
const assetSearch = ref("");
const textDraft = ref("");
const zoom = ref(30);
const snapEnabled = ref(true);
const importBusy = ref(false);
const mediaPickerOpen = ref(false);
const importLabel = ref("");
const importProgress = ref(0);
const importController = shallowRef<AbortController>();
const saveBusy = ref(false);
const savePending = ref(false);
const saveBlocked = ref(false);
const saveRetryable = ref(false);
const projectLoading = ref(false);
const loadedDirectory = ref<string>();
const activeEditorProjectPath = ref(legacyEditorProjectPath);
const activeCanvasPath = ref<string>();
const boundCanvasProjectPath = ref<string>();
const boundProductionProjectPath = ref<string>();
const canvasProjectCandidates = ref<{ path: string; name: string }[]>([]);
const editorProjectName = ref("默认剪辑项目");
const editorProjectOptions = ref<{ path: string; name: string }[]>([]);
const editorProjectsOpen = ref(false);
const newEditorProjectName = ref("");
const projectBusy = ref(false);
const projectError = ref("");
const sourceImportBusy = ref(false);
const sourceImportError = ref("");
const sourceImportNotice = ref("");
const sourceImportLabel = ref("");
const processedSourceImportKey = ref("");
const pendingSourceImportKey = ref("");
const pendingSourceImportAssets = ref<EditorAsset[]>([]);
const retryPickedSource = ref<{ type: "workspace" | "library"; path: string }>();
const pendingPickedAsset = ref<EditorAsset>();
const saveError = ref("");
const previewError = ref("");
const exportError = ref("");
const exportBusy = ref(false);
const exportProgress = ref<number>();
const exportSubmitting = ref(false);
const renderQueueRefreshKey = ref(0);
const renderQueueDialog = ref<HTMLDialogElement>();
const exportController = shallowRef<AbortController>();
const renderSnapshots = new Map<string, { content: string; sourceReferences: { type: string; id: string; label?: string }[]; userId: string }>();
const cacheStatusController = shallowRef<AbortController>();
const lastExport = ref<{ id: string; directory: string; url: string; name: string; path: string; projectPath: string; revision: string; sourceReferences: { type: string; id: string; label?: string }[] }>();
const exportRecordError = ref("");
const exportRecordSaved = ref(false);
const exportRecordBusy = ref(false);
let exportRecordController: AbortController | undefined;
let exportRecordVersion = 0;
const fileInput = ref<HTMLInputElement>();
const relinkInput = ref<HTMLInputElement>();
const subtitleInput = ref<HTMLInputElement>();
const edlInput = ref<HTMLInputElement>();
const timelineViewport = ref<HTMLElement>();
const timelineView = ref({ left: -trackLabelWidth, width: 1200 });
const thumbnailGenerator = shallowRef(createTimelineThumbnailGenerator());
const previewStage = ref<HTMLElement>();
const stageSize = ref({ width: 640, height: 360 });
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const missingAssetIds = ref<string[]>([]);
const recoveryOpen = ref(false);
const recoveryError = ref("");
const recoveryLoading = ref(false);
let recoveryRequestVersion = 0;
const backups = ref<{ name: string; path: string }[]>([]);
const selectedBackup = ref("");
const draftAvailable = ref(false);
const recoverableDraft = ref<{ key: string; revision: string; content: string; updatedAt: number }>();
const videoElements = new Map<string, HTMLVideoElement>();
const audioElements = new Map<string, HTMLAudioElement>();
let projectContext: ProjectContext | undefined;
let applyingProject = false;
let projectVersion = 0;
let saveSequence = 0;
let pendingSave: PendingSave | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let saveQueue = Promise.resolve(true);
let saveRequests = 0;
let playbackTime = 0;
let playbackTimer: ReturnType<typeof setInterval> | undefined;
let resizeObserver: ResizeObserver | undefined;
let timelineResizeObserver: ResizeObserver | undefined;
let releaseDragEvents: (() => void) | undefined;
let dragState: DragState | undefined;
let draggedClipId: string | undefined;
let relinkAssetId: string | undefined;
let cacheGeneration = 0;
let cachePollTimer: ReturnType<typeof setTimeout> | undefined;
const cacheControllers = new Map<string, AbortController>();
let mounted = true;
let audioContext: AudioContext | undefined;
let audioBus: GainNode | undefined;
let audioSplitter: ChannelSplitterNode | undefined;
const audioAnalysers: AnalyserNode[] = [];
let audioMeterSamples: Float32Array<ArrayBuffer> | undefined;
const audioPeakDb = ref(-60);
const audioPeakHoldDb = ref(-60);
const loudnessBusy = ref(false);
const loudnessNotice = ref("");
const loudnessError = ref("");
const targetLoudness = ref(-16);
const loudnessController = shallowRef<AbortController>();
const audioNodes = new Map<string, { element: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode }>();
const audioSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

provide("canvas", createEditorCanvasContext);

const projectReady = computed(() => !!directory.value && loadedDirectory.value === directory.value && !projectLoading.value);
const renderProjectRevision = computed(() => projectReady.value && !saveBusy.value && !savePending.value && !saveError.value ? projectContext?.revision ?? "" : "");
const canRegisterExport = computed(() => !!lastExport.value && projectReady.value && activeEditorProjectPath.value === lastExport.value.projectPath && !saveBlocked.value && !saveError.value && !saveBusy.value && !savePending.value && !exportBusy.value && !sourceImportBusy.value && getProjectContent() === exportedProjectContent.value);
const exportedProjectContent = ref("");
const returnCanvasPath = computed(() => activeCanvasPath.value ?? assets.value.find(asset => asset.source?.canvasPath)?.source?.canvasPath);
const canEdit = computed(() => projectReady.value && !importBusy.value && !sourceImportBusy.value && !projectBusy.value && !exportBusy.value && !exportRecordBusy.value);
const selectedClip = computed(() => clips.value.find(clip => clip.id === selectedClipId.value));
const selectedClipHasAudio = computed(() => {
  const clip = selectedClip.value;
  return !!clip && (clip.kind === "audio" || clip.kind === "video" && assets.value.find(asset => asset.id === clip.assetId)?.hasAudio !== false);
});
const availableKeyframeProperties = computed(() => keyframeProperties.filter(property => property.id === "volume" ? selectedClipHasAudio.value : selectedClip.value?.kind === "video" || selectedClip.value?.kind === "image"));
const sourceAsset = computed(() => assets.value.find(asset => asset.id === sourceAssetId.value));
const sourceAssetUrl = computed(() => mediaUrls.value.get(sourceAssetId.value ?? ""));
const textRenderSize = computed(() => {
  const [width, height] = aspectRatio.value.split(":").map(Number) as [number, number];
  return { width: Math.round(exportHeight.value * width / height / 2) * 2, height: exportHeight.value };
});
const precisionDescription = computed(() => ({
  rippleIn: "正值向后修剪入点，保持片段起点，所有轨道后续片段向前合拢。",
  rippleOut: "正值延长出点，所有轨道后续片段向后顺移。跨切点片段或锁轨会阻止操作。",
  roll: "移动与下一相邻片段的公共切点，保持两段总时长。正值向后移动。",
  slip: "保持时间线位置和时长，整体移动源入出点；正值使用更后面的素材。",
})[precisionOperation.value]);
const keyframePosition = computed(() => {
  const clip = selectedClip.value;
  if (!clip || !availableKeyframeProperties.value.length) return undefined;
  const localTime = currentTime.value - clip.start;
  const duration = clipDuration(clip);
  const tolerance = .5 / frameRate.value;
  if (localTime < -tolerance || localTime > duration + tolerance) return undefined;
  return Math.min(duration, Math.max(0, frameTime(localTime)));
});
const keyframePropertySpec = computed(() => keyframeProperties.find(item => item.id === keyframeProperty.value) ?? keyframeProperties[0]!);
const keyframeFrames = computed(() => selectedClip.value?.keyframes?.filter(frame => frame.property === keyframeProperty.value) ?? []);
const keyframeValue = computed(() => {
  const clip = selectedClip.value;
  return clip && keyframePosition.value !== undefined ? clipKeyframeValue(clip, keyframeProperty.value, keyframePosition.value) : 0;
});
const currentPropertyKeyframe = computed(() => keyframePosition.value === undefined ? undefined : keyframeFrames.value.find(frame => Math.abs(frame.time - keyframePosition.value!) <= .5 / frameRate.value));
const canPlaceKeyframe = computed(() => {
  const clip = selectedClip.value;
  return canEdit.value && !!clip && !isLocked(clip) && availableKeyframeProperties.value.some(item => item.id === keyframeProperty.value) && keyframePosition.value !== undefined;
});
const timelineDuration = computed(() => Math.max(0, ...clips.value.map(clip => clip.start + clipDuration(clip))));
const timelineWidth = computed(() => Math.max(timelineViewport.value?.clientWidth ?? 1200, trackLabelWidth + (timelineDuration.value + 5) * zoom.value));
const activeClips = computed(() => clips.value.filter(clip => currentTime.value >= clip.start && currentTime.value < clip.start + clipDuration(clip)));
const activeVisualClips = computed(() => tracks.value.slice().reverse().filter(track => track.kind !== "audio" && !track.hidden).flatMap(track => {
  const active = activeClips.value.filter(clip => clip.track === track.id).sort((a, b) => a.start - b.start);
  return active.filter((clip, index) => index === active.length - 1 || active.slice(index + 1).every(other => crossfadeDuration(clip, other, 1 / frameRate.value) !== undefined));
}));
const activeSoundClips = computed(() => activeClips.value.filter(clip => (clip.kind === "video" || clip.kind === "audio") && assets.value.find(asset => asset.id === clip.assetId)?.hasAudio !== false));
const visibleAssets = computed(() => assets.value.filter(asset => (mediaFilter.value === "all" || mediaFilter.value === asset.kind) && (activeTab.value !== "audio" || asset.kind === "audio") && asset.name.toLowerCase().includes(assetSearch.value.trim().toLowerCase())));
const canExport = computed(() => canEdit.value && clips.value.length > 0 && !saveBlocked.value && !missingAssetIds.value.length);
const stageStyle = computed(() => {
  const [w, h] = aspectRatio.value.split(":").map(Number) as [number, number];
  const width = Math.min(stageSize.value.width, stageSize.value.height * w / h);
  return { width: `${Math.max(1, width)}px`, height: `${Math.max(1, width * h / w)}px` };
});
const mediaUrls = computed(() => {
  if (!directory.value) return new Map<string, string>();
  const files = useWorkspaceFiles(directory.value);
  return new Map(assets.value.filter(asset => !missingAssetIds.value.includes(asset.id)).map(asset => [asset.id, files.mediaUrl(asset.path)]));
});
const cacheSignature = computed(() => JSON.stringify([directory.value, missingAssetIds.value, assets.value.filter(asset => asset.kind === "video" || asset.kind === "audio").map(asset => [asset.id, asset.path])]));
const cachedMediaById = computed(() => {
  if (!directory.value) return new Map<string, CachedMedia>();
  const files = useWorkspaceFiles(directory.value);
  const result = new Map<string, CachedMedia>();
  for (const asset of assets.value) {
    const entry = cacheStates.value.get(asset.id);
    if (!entry || entry.path !== asset.path || entry.status.state !== "ready") continue;
    const status = entry.status;
    result.set(asset.id, {
      ...(status.proxyPath ? { proxyUrl: files.mediaUrl(status.proxyPath) } : {}),
      ...(status.thumbnails ? { thumbnailSprite: { ...status.thumbnails, url: files.mediaUrl(status.thumbnails.path) } } : {}),
      ...(status.waveform ? { waveform: { duration: status.waveform.duration ?? status.duration ?? asset.duration, peaks: status.waveform.peaks } } : {}),
    });
  }
  return result;
});
const rulerTicks = computed(() => {
  const desiredStep = 90 / zoom.value;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, desiredStep)));
  const step = [1, 2, 5, 10].map(value => value * magnitude).find(value => value >= desiredStep) ?? 10 * magnitude;
  const end = (timelineWidth.value - trackLabelWidth) / zoom.value;
  return Array.from({ length: Math.min(1000, Math.ceil(end / step) + 1) }, (_, index) => index * step);
});
const sourceImportKey = computed(() => JSON.stringify([route.query.sourceDirectory, route.query.canvasPath, route.query.nodeIds, route.query.productionProjectId, route.query.episodeId, route.query.variantIds, route.query.variantId]));
const sourceCanvasPath = computed(() => queryString(route.query.canvasPath) ?? queryString(route.query.editorCanvasPath));

watch([directory, sourceCanvasPath, productionBindingKey], ([next, canvasPath, bindingKey]) => {
  if (pendingSave && !saveBlocked.value) void saveProject();
  importController.value?.abort();
  exportController.value?.abort();
  cacheStatusController.value?.abort();
  if (cachePollTimer) clearTimeout(cachePollTimer);
  for (const controller of cacheControllers.values()) controller.abort();
  cacheControllers.clear();
  cacheBusyIds.value = new Set();
  cachePreparingIds.value = new Set();
  projectVersion++;
  stopPlayback();
  clearEditor();
  activeCanvasPath.value = canvasPath;
  boundCanvasProjectPath.value = undefined;
  boundProductionProjectPath.value = undefined;
  productionEditorTitle.value = "";
  canvasProjectCandidates.value = [];
  if (canvasPath && isProductionEditor.value) {
    saveError.value = "剪辑台不能同时绑定画布与生产项目，请从对应入口重新打开。";
    projectLoading.value = false;
  } else if (isProductionEditor.value) void openProductionEditorProject(next, bindingKey);
  else if (canvasPath) void openCanvasEditorProject(next, canvasPath);
  else if (next) {
    activeEditorProjectPath.value = selectedEditorProjectPath(next);
    void loadProject(next, activeEditorProjectPath.value);
  }
}, { immediate: true, flush: "sync" });
watch(cacheSignature, () => { void refreshCacheStatuses(); }, { immediate: true, flush: "post" });
watch(sessionInvalidated, value => { if (value) invalidateExportIdentity(); });
watch([projectReady, sourceImportKey, exportRecordBusy, sourceImportBusy], ([ready, key, recordBusy, importing]) => {
  if (ready && !recordBusy && !importing && (route.query.canvasPath || route.query.variantIds || route.query.variantId) && key !== processedSourceImportKey.value) void importEditorSources();
}, { immediate: true, flush: "post" });
watch([assets, clips, tracks, aspectRatio, frameRate, exportHeight, exportQuality, editorProjectName], scheduleSave, { deep: true, flush: "sync" });
watch([currentTime, clips, tracks], syncPlayers, { deep: true, flush: "post" });
watch([selectedClipId, keyframeProperty, keyframePosition, keyframeValue], () => { keyframeValueDraft.value = roundNumber(keyframeValue.value); }, { immediate: true });
watch(availableKeyframeProperties, properties => {
  if (!properties.some(item => item.id === keyframeProperty.value)) keyframeProperty.value = properties[0]?.id ?? "x";
}, { immediate: true });
watch(selectedClipId, () => {
  loudnessController.value?.abort();
  loudnessNotice.value = "";
  loudnessError.value = "";
});
watch(selectedClipId, () => { if (selectedClip.value?.kind !== "video" && selectedClip.value?.kind !== "audio" && precisionOperation.value === "slip") precisionOperation.value = "rippleOut"; });
watch(previewMode, mode => {
  stopPlayback();
  if (mode !== "dual") lastSingleMonitor.value = mode;
});
watch(sourceAsset, asset => { if (!asset) previewMode.value = "program"; });
watch(lastExport, value => { if (!value) deliveryDialog.value?.close(); });
watch(editorWorkspace, element => {
  workspaceResizeObserver?.disconnect();
  if (!element) return;
  workspaceResizeObserver = new ResizeObserver(updateTimelineHeight);
  workspaceResizeObserver.observe(element);
  updateTimelineHeight();
});
watch(previewArea, element => {
  previewResizeObserver?.disconnect();
  if (!element) return;
  previewResizeObserver = new ResizeObserver(entries => {
    previewWidth.value = entries[0]?.contentRect.width ?? 0;
    if (previewWidth.value < 720 && previewMode.value === "dual") previewMode.value = lastSingleMonitor.value;
  });
  previewResizeObserver.observe(element);
});
watch(previewStage, stage => {
  resizeObserver?.disconnect();
  const host = stage?.parentElement;
  if (!host) return;
  resizeObserver = new ResizeObserver(entries => {
    const bounds = entries[0]?.contentRect;
    if (bounds) stageSize.value = { width: bounds.width, height: bounds.height };
  });
  resizeObserver.observe(host);
});
watch(timelineViewport, element => {
  timelineResizeObserver?.disconnect();
  if (!element) return;
  timelineResizeObserver = new ResizeObserver(updateTimelineViewport);
  timelineResizeObserver.observe(element);
  updateTimelineViewport();
});
onMounted(() => {
  window.addEventListener("omnistudio-next:account-changed", invalidateExportIdentity);
  window.addEventListener("keydown", onEditorKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
  playbackTime = performance.now();
  playbackTimer = setInterval(() => {
    const now = performance.now();
    if (isPlaying.value) currentTime.value = Math.min(timelineDuration.value, currentTime.value + (now - playbackTime) / 1000);
    playbackTime = now;
    if (currentTime.value >= timelineDuration.value) stopPlayback();
    updateAudioMeter();
  }, 20);
});
onBeforeRouteLeave(async () => {
  if (importBusy.value || sourceImportBusy.value || exportBusy.value || exportRecordBusy.value || projectBusy.value) return false;
  stopPlayback();
  return await saveProject();
});
onBeforeRouteUpdate(async to => {
  const canvasPath = queryString(to.query.canvasPath) ?? queryString(to.query.editorCanvasPath);
  const nextProductionBindingKey = JSON.stringify([to.query.productionProjectId !== undefined, to.query.episodeId !== undefined, to.query.productionProjectId, to.query.episodeId]);
  if (canvasPath === activeCanvasPath.value && nextProductionBindingKey === productionBindingKey.value) return;
  if (importBusy.value || sourceImportBusy.value || exportBusy.value || exportRecordBusy.value || projectBusy.value) return false;
  stopPlayback();
  return await saveProject();
});
onBeforeUnmount(() => {
  mounted = false;
  exportRecordController?.abort();
  window.removeEventListener("omnistudio-next:account-changed", invalidateExportIdentity);
  cacheStatusController.value?.abort();
  if (cachePollTimer) clearTimeout(cachePollTimer);
  for (const controller of cacheControllers.values()) controller.abort();
  cacheControllers.clear();
  cachePreparingIds.value = new Set();
  projectVersion++;
  window.removeEventListener("keydown", onEditorKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  if (playbackTimer) clearInterval(playbackTimer);
  if (persistTimer) clearTimeout(persistTimer);
  resizeObserver?.disconnect();
  timelineResizeObserver?.disconnect();
  workspaceResizeObserver?.disconnect();
  previewResizeObserver?.disconnect();
  stopTimelineResize();
  thumbnailGenerator.value.dispose();
  releaseDragEvents?.();
  stopPlayback();
  importController.value?.abort();
  exportController.value?.abort();
  loudnessController.value?.abort();
  audioBus?.disconnect();
  audioSplitter?.disconnect();
  for (const analyser of audioAnalysers) analyser.disconnect();
  for (const node of audioNodes.values()) { node.source.disconnect(); node.gain.disconnect(); }
  audioNodes.clear();
  void audioContext?.close();
});

function openDelivery() {
  stopPlayback();
  deliveryDialog.value?.showModal();
}
function closeInspector() {
  inspectorOpen.value = false;
  inspectorButton.value?.focus();
}
function togglePreviewExpanded() {
  previewExpanded.value = !previewExpanded.value;
  inspectorOpen.value = false;
  expandButton.value?.focus();
}
function onPanelTabKeydown(event: KeyboardEvent, index: number) {
  let nextIndex: number;
  if (event.key === "ArrowDown") nextIndex = (index + 1) % panelTabs.length;
  else if (event.key === "ArrowUp") nextIndex = (index + panelTabs.length - 1) % panelTabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = panelTabs.length - 1;
  else return;
  event.preventDefault();
  event.stopPropagation();
  activeTab.value = panelTabs[nextIndex]!.id;
  (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>("button")[nextIndex]?.focus();
}
function updateTimelineHeight() {
  if (!editorWorkspace.value) return;
  timelineMaxHeight.value = Math.max(220, Math.min(420, Math.floor(editorWorkspace.value.clientHeight - 288)));
  const requested = preferredTimelineHeight ?? Math.min(320, (editorRoot.value?.clientHeight ?? 760) * .29);
  timelineHeight.value = Math.max(220, Math.min(timelineMaxHeight.value, requested));
}
function resizeTimeline(height: number) {
  preferredTimelineHeight = Math.max(220, Math.min(timelineMaxHeight.value, height));
  updateTimelineHeight();
}
function startTimelineResize(event: PointerEvent) {
  if (event.button !== 0) return;
  const element = event.currentTarget as HTMLElement;
  timelineResizeDrag = { y: event.clientY, height: timelineHeight.value, pointerId: event.pointerId, element };
  element.setPointerCapture(event.pointerId);
  element.focus();
  event.preventDefault();
}
function moveTimelineResize(event: PointerEvent) {
  if (timelineResizeDrag?.pointerId === event.pointerId) resizeTimeline(timelineResizeDrag.height + timelineResizeDrag.y - event.clientY);
}
function stopTimelineResize() {
  const drag = timelineResizeDrag;
  timelineResizeDrag = undefined;
  if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId);
}
function onTimelineResizeKeydown(event: KeyboardEvent) {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  resizeTimeline(event.key === "Home" ? 220 : event.key === "End" ? timelineMaxHeight.value : timelineHeight.value + (event.key === "ArrowUp" ? 20 : -20));
}

function getProject(): EditorProject {
  return JSON.parse(JSON.stringify({ version: 2, name: editorProjectName.value.trim(), assets: assets.value, clips: clips.value, tracks: tracks.value, aspectRatio: aspectRatio.value, frameRate: frameRate.value, exportHeight: exportHeight.value, exportQuality: exportQuality.value }));
}
function getProjectContent() { return JSON.stringify(getProject()); }
function applyProject(project: EditorProject) {
  audioPeakDb.value = -60;
  audioPeakHoldDb.value = -60;
  applyingProject = true;
  editorProjectName.value = project.name || (activeEditorProjectPath.value === legacyEditorProjectPath ? "默认剪辑项目" : activeEditorProjectPath.value.split("/").at(-1)?.replace(/\.json$/, "") || "剪辑项目");
  assets.value = project.assets;
  clips.value = project.clips;
  tracks.value = project.tracks;
  aspectRatio.value = project.aspectRatio;
  frameRate.value = project.frameRate;
  exportHeight.value = project.exportHeight;
  exportQuality.value = project.exportQuality;
  currentTime.value = Math.min(currentTime.value, timelineDuration.value);
  selectedClipId.value = undefined;
  applyingProject = false;
}
function clearEditor() {
  loudnessController.value?.abort();
  loudnessNotice.value = "";
  loudnessError.value = "";
  audioPeakDb.value = -60;
  audioPeakHoldDb.value = -60;
  for (const node of audioNodes.values()) { node.source.disconnect(); node.gain.disconnect(); }
  audioNodes.clear();
  exportRecordController?.abort();
  exportRecordVersion++;
  exportRecordError.value = "";
  exportRecordSaved.value = false;
  exportRecordBusy.value = false;
  thumbnailGenerator.value.dispose();
  thumbnailGenerator.value = createTimelineThumbnailGenerator();
  applyingProject = true;
  loadedDirectory.value = undefined;
  projectContext = undefined;
  editorProjectOptions.value = [];
  backups.value = [];
  selectedBackup.value = "";
  recoveryOpen.value = false;
  recoveryError.value = "";
  recoveryLoading.value = false;
  recoveryRequestVersion++;
  projectLoading.value = !!directory.value;
  editorProjectName.value = activeEditorProjectPath.value === legacyEditorProjectPath ? "默认剪辑项目" : activeEditorProjectPath.value.split("/").at(-1)?.replace(/\.json$/, "") || "剪辑项目";
  pendingSave = undefined;
  savePending.value = false;
  saveBusy.value = saveRequests > 0;
  importBusy.value = false;
  mediaPickerOpen.value = false;
  sourceImportBusy.value = false;
  sourceImportError.value = "";
  sourceImportNotice.value = "";
  processedSourceImportKey.value = "";
  pendingSourceImportKey.value = "";
  pendingSourceImportAssets.value = [];
  retryPickedSource.value = undefined;
  pendingPickedAsset.value = undefined;
  exportBusy.value = false;
  saveBlocked.value = false;
  saveError.value = "";
  saveRetryable.value = false;
  previewError.value = "";
  editError.value = "";
  exportError.value = "";
  sourceAssetId.value = undefined;
  previewMode.value = "program";
  editMode.value = "select";
  assets.value = [];
  clips.value = [];
  tracks.value = createDefaultTracks();
  undoStack.value = [];
  redoStack.value = [];
  missingAssetIds.value = [];
  draftAvailable.value = false;
  recoverableDraft.value = undefined;
  lastExport.value = undefined;
  exportedProjectContent.value = "";
  currentTime.value = 0;
  applyingProject = false;
}
function roundNumber(value: number) { return Math.round(value * 10000) / 10000; }
function frameTime(value: number) { return Math.round(Math.min(86400, Math.max(0, Number.isFinite(value) ? value : 0)) * frameRate.value) / frameRate.value; }
function formatTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const frames = Math.floor(safe * frameRate.value + .00001);
  return `${String(Math.floor(frames / frameRate.value / 60)).padStart(2, "0")}:${String(Math.floor(frames / frameRate.value) % 60).padStart(2, "0")}.${String(frames % frameRate.value).padStart(2, "0")}`;
}
function formatBytes(value: number) { return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GiB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }
function clipTrackKind(clip: EditorClip): TrackKind { return clip.kind === "image" ? "video" : clip.kind; }
function isLocked(clip: EditorClip) { return tracks.value.find(track => track.id === clip.track)?.locked ?? true; }
function clampFades(clip: EditorClip) {
  clip.fadeIn = Math.min(clip.fadeIn ?? 0, clipDuration(clip));
  clip.fadeOut = Math.min(clip.fadeOut ?? 0, clipDuration(clip));
  clip.transitionIn = Math.min(clip.transitionIn ?? 0, clipDuration(clip) / 2);
  clip.transitionOut = Math.min(clip.transitionOut ?? 0, clipDuration(clip) / 2);
}
function clipStyle(clip: EditorClip) { return { left: `${clip.start * zoom.value}px`, width: `${Math.max(2, clipDuration(clip) * zoom.value)}px` }; }
function updateTimelineViewport() {
  const element = timelineViewport.value;
  if (element) timelineView.value = { left: element.scrollLeft - trackLabelWidth, width: element.clientWidth };
}
function fadeLevel(clip: EditorClip, sound = false, timelineTime = currentTime.value) {
  const time = timelineTime - clip.start;
  const fadeIn = Math.max(clip.fadeIn ?? 0, clip.transitionIn ?? 0);
  const hasCrossfadeOut = !sound && clips.value.some(other => other.id !== clip.id && crossfadeDuration(clip, other, 1 / frameRate.value) !== undefined);
  const fadeOut = Math.max(clip.fadeOut ?? 0, hasCrossfadeOut ? 0 : clip.transitionOut ?? 0);
  const inLevel = Math.max(0, Math.min(1, fadeIn ? time / fadeIn : 1));
  const outLevel = Math.max(0, Math.min(1, fadeOut ? (clipDuration(clip) - time) / fadeOut : 1));
  return sound ? inLevel * outLevel : Math.min(inLevel, outLevel);
}
function visualStyle(clip: EditorClip) {
  const time = currentTime.value - clip.start;
  return { transform: `translate(${clipKeyframeValue(clip, "x", time)}cqw, ${clipKeyframeValue(clip, "y", time)}cqh) rotate(${clip.rotation ?? 0}deg) scale(${clip.scale ?? 1})`, opacity: clipKeyframeValue(clip, "opacity", time) * fadeLevel(clip), filter: `brightness(${clip.brightness ?? 1}) contrast(${clip.contrast ?? 1}) saturate(${clip.saturation ?? 1})` };
}
function textOpacity(clip: EditorClip) { return (clip.opacity ?? 1) * fadeLevel(clip); }
function assetUrl(clip: EditorClip) { return mediaUrls.value.get(clip.assetId ?? ""); }
function previewAssetUrl(clip: EditorClip) { return cachedMediaById.value.get(clip.assetId ?? "")?.proxyUrl ?? assetUrl(clip); }
function waveformForClip(clip: EditorClip) { return cachedMediaById.value.get(clip.assetId ?? "")?.waveform; }
function cacheStatus(asset: EditorAsset) {
  const entry = cacheStates.value.get(asset.id);
  return entry?.path === asset.path ? entry.status : undefined;
}
function cacheError(asset: EditorAsset) {
  const entry = cacheErrors.value.get(asset.id);
  return entry?.path === asset.path ? entry.message : "";
}
function cacheStatusText(asset: EditorAsset) {
  const error = cacheError(asset);
  if (error) return error;
  const state = cacheStatus(asset)?.state;
  if (state === "ready") return asset.kind === "video" ? "代理与逐帧缓存就绪" : "波形缓存就绪";
  if (state === "stale") return "缓存已过期";
  if (state === "processing") return "缓存处理中";
  return "尚未生成缓存";
}
function cacheActionText(asset: EditorAsset) {
  if (cacheBusyIds.value.has(asset.id)) return "正在处理";
  const state = cacheStatus(asset)?.state;
  if (state === "ready") return "清理缓存";
  if (state === "stale") return "重新生成";
  if (cacheError(asset)) return "重试生成";
  return "生成缓存";
}
function setCacheState(asset: EditorAsset, targetDirectory: string, status: EditorCacheStatus) {
  if (directory.value !== targetDirectory || !assets.value.some(item => item.id === asset.id && item.path === asset.path)) return;
  const next = new Map(cacheStates.value);
  next.set(asset.id, { path: asset.path, status });
  cacheStates.value = next;
}
function setCacheError(asset: EditorAsset, targetDirectory: string, message: string) {
  if (directory.value !== targetDirectory || !assets.value.some(item => item.id === asset.id && item.path === asset.path)) return;
  const next = new Map(cacheErrors.value);
  next.set(asset.id, { path: asset.path, message });
  cacheErrors.value = next;
}
function cacheRequestError(error: unknown, fallback: string) {
  return axios.isAxiosError<ApiResponse<unknown>>(error) ? error.response?.data?.message || fallback : error instanceof Error ? error.message : fallback;
}
async function fetchCacheStatus(asset: EditorAsset, targetDirectory: string, signal: AbortSignal) {
  const { data } = await axios.get<ApiResponse<EditorCacheStatus>>("/api/videoEditor/cache/status", { params: { directory: targetDirectory, path: asset.path }, signal });
  return data.data;
}
async function refreshCacheStatuses() {
  cacheStatusController.value?.abort();
  const controller = new AbortController();
  cacheStatusController.value = controller;
  const generation = ++cacheGeneration;
  const targetDirectory = directory.value;
  if (!targetDirectory) {
    cacheStates.value = new Map();
    cacheErrors.value = new Map();
    return;
  }
  const targets = assets.value.filter(asset => (asset.kind === "video" || asset.kind === "audio") && !missingAssetIds.value.includes(asset.id));
  const targetIds = new Set(targets.map(asset => asset.id));
  cacheStates.value = new Map([...cacheStates.value].filter(([id, entry]) => targetIds.has(id) && targets.some(asset => asset.id === id && asset.path === entry.path)));
  cacheErrors.value = new Map([...cacheErrors.value].filter(([id, entry]) => targetIds.has(id) && targets.some(asset => asset.id === id && asset.path === entry.path)));
  let offset = 0;
  const worker = async () => {
    while (!controller.signal.aborted && offset < targets.length) {
      const asset = targets[offset++];
      if (!asset) return;
      try {
        const status = await fetchCacheStatus(asset, targetDirectory, controller.signal);
        if (generation === cacheGeneration) setCacheState(asset, targetDirectory, status);
      } catch (error) {
        if (!controller.signal.aborted && generation === cacheGeneration) setCacheError(asset, targetDirectory, cacheRequestError(error, "读取缓存状态失败"));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));
  if (!controller.signal.aborted && generation === cacheGeneration && [...cacheStates.value.values()].some(entry => entry.status.state === "processing")) {
    cachePollTimer = setTimeout(() => { void refreshCacheStatuses(); }, 1500);
  }
}
async function toggleMediaCache(asset: EditorAsset) {
  if (cacheStatus(asset)?.state === "ready") await clearMediaCache(asset);
  else await prepareMediaCache(asset);
}
async function prepareMediaCache(asset: EditorAsset) {
  const targetDirectory = directory.value;
  if (!targetDirectory || !canEdit.value || missingAssetIds.value.includes(asset.id)) return;
  cacheControllers.get(asset.id)?.abort();
  const controller = new AbortController();
  cacheControllers.set(asset.id, controller);
  cacheBusyIds.value = new Set(cacheBusyIds.value).add(asset.id);
  cachePreparingIds.value = new Set(cachePreparingIds.value).add(asset.id);
  const nextErrors = new Map(cacheErrors.value);
  nextErrors.delete(asset.id);
  cacheErrors.value = nextErrors;
  setCacheState(asset, targetDirectory, { state: "processing" });
  try {
    const { data } = await axios.post<ApiResponse<EditorCacheStatus>>("/api/videoEditor/cache/prepare", { directory: targetDirectory, path: asset.path }, { signal: controller.signal });
    setCacheState(asset, targetDirectory, data.data);
  } catch (error) {
    if (!controller.signal.aborted) {
      const nextStates = new Map(cacheStates.value);
      nextStates.delete(asset.id);
      cacheStates.value = nextStates;
      setCacheError(asset, targetDirectory, cacheRequestError(error, "缓存生成失败"));
    }
  } finally {
    if (cacheControllers.get(asset.id) === controller) {
      cacheControllers.delete(asset.id);
      const nextBusy = new Set(cacheBusyIds.value);
      nextBusy.delete(asset.id);
      cacheBusyIds.value = nextBusy;
      const nextPreparing = new Set(cachePreparingIds.value);
      nextPreparing.delete(asset.id);
      cachePreparingIds.value = nextPreparing;
      if (controller.signal.aborted) void refreshCacheStatuses();
    }
  }
}
async function clearMediaCache(asset: EditorAsset) {
  const targetDirectory = directory.value;
  if (!targetDirectory || !canEdit.value || missingAssetIds.value.includes(asset.id)) return;
  const controller = new AbortController();
  cacheControllers.set(asset.id, controller);
  cacheBusyIds.value = new Set(cacheBusyIds.value).add(asset.id);
  const nextErrors = new Map(cacheErrors.value);
  nextErrors.delete(asset.id);
  cacheErrors.value = nextErrors;
  try {
    await axios.post<ApiResponse<{ cleared: boolean }>>("/api/videoEditor/cache/clear", { directory: targetDirectory, path: asset.path }, { signal: controller.signal });
    const status = await fetchCacheStatus(asset, targetDirectory, controller.signal);
    setCacheState(asset, targetDirectory, status);
  } catch (error) {
    if (!controller.signal.aborted) setCacheError(asset, targetDirectory, cacheRequestError(error, "清理缓存失败"));
  } finally {
    if (cacheControllers.get(asset.id) === controller) {
      cacheControllers.delete(asset.id);
      const nextBusy = new Set(cacheBusyIds.value);
      nextBusy.delete(asset.id);
      cacheBusyIds.value = nextBusy;
    }
  }
}
async function cancelMediaCache(asset: EditorAsset) {
  const controller = cacheControllers.get(asset.id);
  const targetDirectory = directory.value;
  if (!controller || !targetDirectory) return;
  controller.abort();
  try {
    await axios.post<ApiResponse<{ cancelled: boolean }>>("/api/videoEditor/cache/cancel", { directory: targetDirectory, path: asset.path });
    const status = await fetchCacheStatus(asset, targetDirectory, new AbortController().signal);
    setCacheState(asset, targetDirectory, status);
  } catch (error) {
    if (directory.value === targetDirectory) setCacheError(asset, targetDirectory, cacheRequestError(error, "停止缓存生成失败"));
  }
}
function mediaFailed(clip: EditorClip) { previewError.value = `无法播放「${clip.title}」，请检查素材是否存在或使用当前浏览器支持的编码。`; }
function selectClip(clip: EditorClip) {
  previewMode.value = "program";
  if (draggedClipId === clip.id) { draggedClipId = undefined; return; }
  selectedClipId.value = clip.id;
  seekTo(clip.start + clipDuration(clip) / 2);
}
function updateKeyframeDraft(event: Event) {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  if (Number.isFinite(value)) keyframeValueDraft.value = value;
}
function writeKeyframe() {
  const clip = selectedClip.value;
  const time = keyframePosition.value;
  if (!canPlaceKeyframe.value || !clip || time === undefined) return;
  const property = keyframeProperty.value;
  const existing = currentPropertyKeyframe.value;
  if (!existing && (clip.keyframes?.length ?? 0) >= 2048) { previewError.value = "单个片段不能超过 2048 个关键帧"; return; }
  const spec = keyframePropertySpec.value;
  const value = Math.min(spec.max, Math.max(spec.min, keyframeValueDraft.value));
  stopPlayback();
  draggedClipId = undefined;
  saveHistory();
  const frames = (clip.keyframes ?? []).filter(frame => frame !== existing);
  frames.push({ property, time: existing?.time ?? time, value });
  clip.keyframes = frames.sort((left, right) => left.time - right.time || left.property.localeCompare(right.property));
  keyframeValueDraft.value = value;
}
function removeCurrentKeyframe() {
  const frame = currentPropertyKeyframe.value;
  if (frame) removeKeyframe(frame);
}
function removeKeyframe(frame: EditorKeyframe) {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  stopPlayback();
  saveHistory();
  clip.keyframes = clip.keyframes?.filter(item => item !== frame);
}
function navigateKeyframe(delta: number) {
  const clip = selectedClip.value;
  const frames = keyframeFrames.value;
  if (!clip || !frames.length) return;
  const time = currentTime.value - clip.start;
  const tolerance = .5 / frameRate.value;
  const frame = delta < 0 ? frames.findLast(frame => frame.time < time - tolerance) ?? frames[0]! : frames.find(frame => frame.time > time + tolerance) ?? frames.at(-1)!;
  stopPlayback();
  seekTo(clip.start + frame.time);
}
function saveHistory() {
  undoStack.value.push(JSON.stringify(getProject()));
  if (undoStack.value.length > 80) undoStack.value.shift();
  redoStack.value = [];
}
function undo() {
  if (!canEdit.value) return;
  const previous = undoStack.value.pop();
  if (!previous) return;
  redoStack.value.push(JSON.stringify(getProject()));
  applyProject(parseEditorProject(JSON.parse(previous)));
  scheduleSave();
  void checkMedia();
}
function redo() {
  if (!canEdit.value) return;
  const next = redoStack.value.pop();
  if (!next) return;
  undoStack.value.push(JSON.stringify(getProject()));
  applyProject(parseEditorProject(JSON.parse(next)));
  scheduleSave();
  void checkMedia();
}
function addTrack(kind: TrackKind) {
  if (!canEdit.value) return;
  saveHistory();
  const label = trackKinds.find(item => item.id === kind)!.label;
  tracks.value.unshift({ id: crypto.randomUUID(), kind, label: `${label} ${tracks.value.filter(track => track.kind === kind).length + 1}`, locked: false, muted: false, hidden: false });
}
function writableTrack(kind: TrackKind) {
  let track = tracks.value.find(item => item.kind === kind && !item.locked);
  if (!track) {
    track = { id: crypto.randomUUID(), kind, label: trackKinds.find(item => item.id === kind)!.label, locked: false, muted: false, hidden: false };
    tracks.value.unshift(track);
  }
  return track;
}
function renameTrack(track: EditorTrack, event: Event) {
  if (!canEdit.value || track.locked) return;
  const input = event.currentTarget as HTMLInputElement;
  const name = input.value.trim();
  if (name && name !== track.label) { saveHistory(); track.label = name; }
  input.value = track.label;
}
function toggleTrack(track: EditorTrack, field: "locked" | "muted" | "hidden" | "solo") {
  if (!canEdit.value || (track.locked && field !== "locked")) return;
  saveHistory();
  track[field] = !track[field];
}
function toggleMixerTrack(input: { id: string; field: "muted" | "solo" }) {
  const track = tracks.value.find(item => item.id === input.id);
  if (track && track.kind !== "text") toggleTrack(track, input.field);
}
function changeTrackVolume(input: { id: string; value: number }) {
  const track = tracks.value.find(item => item.id === input.id);
  if (!canEdit.value || !track || track.locked || track.kind === "text" || !Number.isFinite(input.value)) return;
  const value = Math.max(0, Math.min(2, input.value));
  if (value === (track.volume ?? 1)) return;
  saveHistory();
  track.volume = value;
}
function reorderTrack(index: number, delta: number) {
  const track = tracks.value[index];
  const target = index + delta;
  if (!canEdit.value || !track || track.locked || target < 0 || target >= tracks.value.length) return;
  saveHistory();
  tracks.value.splice(index, 1);
  tracks.value.splice(target, 0, track);
}
function removeTrack(track: EditorTrack) {
  if (!canEdit.value || track.locked) return;
  if (clips.value.some(clip => clip.track === track.id) && !window.confirm(`删除「${track.label}」和其中的片段？可使用撤销恢复。`)) return;
  saveHistory();
  clips.value = clips.value.filter(clip => clip.track !== track.id);
  tracks.value = tracks.value.filter(item => item.id !== track.id);
}
function moveSelectedTrack(event: Event) {
  const clip = selectedClip.value;
  const track = tracks.value.find(item => item.id === (event.currentTarget as HTMLSelectElement).value);
  if (!canEdit.value || !clip || isLocked(clip) || !track || track.locked || track.kind !== clipTrackKind(clip)) return;
  saveHistory();
  clip.track = track.id;
}
function addAssetToTimeline(asset: EditorAsset, startAt?: number, trackId?: string) {
  if (!canEdit.value || missingAssetIds.value.includes(asset.id)) return;
  saveHistory();
  const track = tracks.value.find(item => item.id === trackId) ?? writableTrack(asset.kind === "image" ? "video" : asset.kind);
  if (track.locked) return;
  const end = Math.max(0, ...clips.value.filter(clip => clip.track === track.id).map(clip => clip.start + clipDuration(clip)));
  const clip: EditorClip = { id: crypto.randomUUID(), assetId: asset.id, title: asset.name, kind: asset.kind, track: track.id, start: Math.min(frameTime(startAt ?? end), 86400 - asset.duration), inPoint: 0, outPoint: asset.duration, volume: 1 };
  clips.value.push(clip);
  selectedClipId.value = clip.id;
  seekTo(clip.start);
}
function openSourceAsset(asset: EditorAsset) {
  stopPlayback();
  sourceAssetId.value = asset.id;
  previewMode.value = "source";
}
function editorAgentState() {
  return {
    projectName: editorProjectName.value,
    aspectRatio: aspectRatio.value,
    frameRate: frameRate.value,
    currentTime: currentTime.value,
    duration: timelineDuration.value,
    assets: assets.value.map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind, duration: asset.duration })),
    tracks: tracks.value.map(track => ({ id: track.id, label: track.label, kind: track.kind, locked: track.locked })),
    clips: clips.value.map(clip => ({ id: clip.id, title: clip.title, kind: clip.kind, trackId: clip.track, start: clip.start, duration: clipDuration(clip), inPoint: clip.inPoint, outPoint: clip.outPoint })),
  };
}
function createEditorCanvasContext(): CanvasContext | undefined {
  if (!projectReady.value || !projectContext) return;
  const contextPath = projectContext.projectPath;
  const contextVersion = projectVersion;
  let expectedContent = getProjectContent();
  const assertCurrent = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (!projectReady.value || activeEditorProjectPath.value !== contextPath || projectVersion !== contextVersion) throw new Error("剪辑工程已切换，请重新发送消息");
    if (saveBlocked.value || saveError.value || !canEdit.value) throw new Error("剪辑工程当前不可编辑，请先解决保存或导入状态");
    if (getProjectContent() !== expectedContent) throw new Error("剪辑工程已被其他操作修改，请重新读取状态后继续");
  };
  return {
    id: `editor:${contextPath}`,
    version: `${contextVersion}:${projectContext.revision}`,
    tools: [],
    async call(request, signal) {
      assertCurrent(signal);
      const before = getProjectContent();
      let result: unknown;
      let changed = false;
      switch (request.name) {
        case "editorGetState":
          canvasSchemas.editorGetState.parse(request.args);
          result = editorAgentState();
          break;
        case "editorAddClip": {
          const args = canvasSchemas.editorAddClip.parse(request.args);
          const asset = assets.value.find(item => item.id === args.assetId);
          if (!asset || missingAssetIds.value.includes(asset.id)) throw new Error("素材不存在或需要重新链接");
          const kind = asset.kind === "image" ? "video" : asset.kind;
          const target = args.trackId ? tracks.value.find(item => item.id === args.trackId) : tracks.value.find(item => item.kind === kind && !item.locked);
          if (args.trackId && !target) throw new Error("目标轨道不存在");
          if (target && (target.kind !== kind || target.locked)) throw new Error("目标轨道类型不匹配或已锁定");
          const count = clips.value.length;
          previewMode.value = "program";
          addAssetToTimeline(asset, args.startAt, target?.id);
          const clip = selectedClip.value;
          if (clips.value.length !== count + 1 || !clip) throw new Error("添加素材到时间线失败");
          result = { clipId: clip.id, title: clip.title, trackId: clip.track, start: clip.start, duration: clipDuration(clip) };
          changed = true;
          break;
        }
        case "editorSelectClip": {
          const { clipId } = canvasSchemas.editorSelectClip.parse(request.args);
          const clip = clips.value.find(item => item.id === clipId);
          if (!clip) throw new Error("片段不存在，请重新读取工程状态");
          selectClip(clip);
          result = { clipId: clip.id, title: clip.title, currentTime: currentTime.value };
          break;
        }
        case "editorSeekTo": {
          const { time } = canvasSchemas.editorSeekTo.parse(request.args);
          stopPlayback();
          seekTo(frameTime(time));
          result = { currentTime: currentTime.value };
          break;
        }
        case "editorSplitClip": {
          const { clipId, atTime } = canvasSchemas.editorSplitClip.parse(request.args);
          const clip = clips.value.find(item => item.id === clipId);
          if (!clip) throw new Error("片段不存在，请重新读取工程状态");
          if (isLocked(clip)) throw new Error("片段所在轨道已锁定");
          const time = frameTime(atTime);
          const speed = clip.speed ?? 1;
          const sourcePoint = clip.inPoint + (time - clip.start) * speed;
          const minimum = speed / frameRate.value;
          if (sourcePoint < clip.inPoint + minimum - .000001 || sourcePoint > clip.outPoint - minimum + .000001) throw new Error("分割点须位于片段内部，且两侧至少各保留一帧");
          const count = clips.value.length;
          previewMode.value = "program";
          selectedClipId.value = clip.id;
          seekTo(time);
          splitSelectedClip();
          const tail = selectedClip.value;
          if (clips.value.length !== count + 1 || !tail) throw new Error("分割片段失败");
          const head = clips.value.find(item => item.id === clip.id)!;
          result = { head: { clipId: head.id, start: head.start, duration: clipDuration(head) }, tail: { clipId: tail.id, start: tail.start, duration: clipDuration(tail) } };
          changed = true;
          break;
        }
        case "editorUndo": {
          canvasSchemas.editorUndo.parse(request.args);
          const point = agentUndoPoint.value;
          if (!point || point.projectPath !== contextPath || point.after !== before || undoStack.value.at(-1) !== point.before) throw new Error("没有可安全撤销的最近一次 AI 剪辑，或工程已被其他操作修改");
          undo();
          agentUndoPoint.value = undefined;
          result = { undone: true, clipCount: clips.value.length };
          changed = true;
          break;
        }
        default:
          throw new Error("此工具不属于剪辑台操作");
      }
      await nextTick();
      const after = getProjectContent();
      if (changed && after !== before) {
        const previous = undoStack.value.at(-1);
        if (request.name !== "editorUndo" && previous !== before) throw new Error("撤销记录与剪辑工程状态不一致，已停止 AI 操作");
        if (request.name !== "editorUndo") agentUndoPoint.value = { projectPath: contextPath, before, after };
        expectedContent = after;
        if (!await saveProject()) throw new Error("剪辑已应用到当前工程，但自动保存失败；请先处理保存提示");
        assertCurrent(signal);
      } else if (after !== before) {
        throw new Error("非修改型剪辑操作意外改变了工程内容");
      }
      return result;
    },
  };
}
function insertSourceSelection(selection: { asset: EditorAsset; inPoint: number; outPoint: number }) {
  if (!canEdit.value || missingAssetIds.value.includes(selection.asset.id)) return;
  const kind = selection.asset.kind === "image" ? "video" : selection.asset.kind;
  const selectedTrack = tracks.value.find(track => track.id === selectedClip.value?.track && track.kind === kind && !track.locked);
  const track = selectedTrack ?? tracks.value.find(track => track.kind === kind && !track.locked);
  if (!track) { editError.value = "请先添加或解锁相应类型的目标轨道，再插入选区。"; return; }
  const clip: EditorClip = { id: crypto.randomUUID(), assetId: selection.asset.id, title: selection.asset.name, kind: selection.asset.kind, track: track.id, start: currentTime.value, inPoint: selection.inPoint, outPoint: selection.outPoint, volume: 1 };
  try {
    const next = insertClipAtTime(timelineEditContext(), clip, currentTime.value);
    stopPlayback();
    saveHistory();
    clips.value = next;
    selectedClipId.value = clip.id;
    editError.value = "";
    seekTo(clip.start + clipDuration(clip));
  } catch (error) { editError.value = errorMessage(error, "插入选区失败"); }
}
function timelineEditContext(sourceClips = clips.value) { return { clips: sourceClips, tracks: tracks.value, assets: assets.value, frameRate: frameRate.value }; }
function rippleDeleteSelected() {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  try {
    const next = rippleDeleteClip(timelineEditContext(), clip.id);
    stopPlayback();
    saveHistory();
    clips.value = next;
    selectedClipId.value = undefined;
    seekTo(clip.start);
    editError.value = "";
  } catch (error) { editError.value = errorMessage(error, "波纹删除失败"); }
}
function adjacentRollClip(sourceClips: EditorClip[], clip: EditorClip, edge: "left" | "right") {
  const tolerance = .000001;
  const point = edge === "left" ? clip.start : clip.start + clipDuration(clip);
  const matches = sourceClips.filter(other => other.id !== clip.id && other.track === clip.track && Math.abs((edge === "left" ? other.start + clipDuration(other) : other.start) - point) <= tolerance);
  if (matches.length !== 1) throw new Error("滚动编辑需要同轨上恰好一个首尾相邻的片段。请先消除空隙或重叠。");
  return matches[0]!;
}
function applyPrecisionEdit(frames: number) {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip) || !Number.isInteger(frames) || !frames) return;
  try {
    const context = timelineEditContext();
    const delta = frames / frameRate.value;
    let next: EditorClip[];
    if (precisionOperation.value === "slip") next = slipEditClip(context, clip.id, delta);
    else if (precisionOperation.value === "roll") next = rollEditClips(context, clip.id, adjacentRollClip(clips.value, clip, "right").id, delta);
    else next = rippleTrimClip(context, clip.id, precisionOperation.value === "rippleIn" ? "left" : "right", delta);
    stopPlayback();
    saveHistory();
    clips.value = next;
    editError.value = "";
    seekTo(Math.min(currentTime.value, timelineDuration.value));
  } catch (error) { editError.value = errorMessage(error, "精确剪辑失败"); }
}
function addTextClip() {
  const text = textDraft.value.trim();
  if (!canEdit.value || !text) return;
  saveHistory();
  const track = writableTrack("text");
  const clip: EditorClip = { id: crypto.randomUUID(), title: text.slice(0, 24), kind: "text", track: track.id, start: Math.min(frameTime(currentTime.value), 86395), inPoint: 0, outPoint: 5, volume: 1, text };
  clips.value.push(clip);
  selectedClipId.value = clip.id;
  textDraft.value = "";
}
function deleteSelectedClip() {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  saveHistory();
  clips.value = clips.value.filter(item => item.id !== clip.id);
  selectedClipId.value = undefined;
}
function duplicateSelectedClip() {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  saveHistory();
  const next = { ...clip, keyframes: clip.keyframes?.map(frame => ({ ...frame })), id: crypto.randomUUID(), title: `${clip.title} 副本`, start: Math.min(frameTime(clip.start + clipDuration(clip)), 86400 - clipDuration(clip)) };
  clips.value.push(next);
  selectedClipId.value = next.id;
}
function applyCrossfade() {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || (clip.kind !== "video" && clip.kind !== "image") || isLocked(clip)) return;
  const frameDuration = 1 / frameRate.value;
  const tolerance = frameDuration;
  const duration = clipDuration(clip);
  const candidates = clips.value.filter(item => item.id !== clip.id && item.track === clip.track && (item.kind === "video" || item.kind === "image") && !isLocked(item));
  const next = candidates.filter(item => {
    const end = clip.start + duration;
    const configured = clip.transitionOut ?? 0;
    return Math.abs(item.start - end) <= tolerance || configured >= frameDuration / 2 && Math.abs(item.start - (end - configured)) <= tolerance && crossfadeDuration(clip, item, frameDuration) !== undefined;
  }).sort((a, b) => a.start - b.start)[0];
  const previous = candidates.filter(item => {
    const end = item.start + clipDuration(item);
    const configured = clip.transitionIn ?? 0;
    return Math.abs(end - clip.start) <= tolerance || configured >= frameDuration / 2 && Math.abs(clip.start - (end - configured)) <= tolerance && crossfadeDuration(item, clip, frameDuration) !== undefined;
  }).sort((a, b) => b.start - a.start)[0];
  const outgoing = next ? clip : previous;
  const incoming = next ?? clip;
  if (!outgoing || !incoming || incoming.id === outgoing.id) { previewError.value = "请先在同一视频轨上放置相邻片段"; return; }
  const outgoingDuration = clipDuration(outgoing);
  const incomingDuration = clipDuration(incoming);
  const overlap = Math.min(.5, outgoingDuration / 2, incomingDuration / 2);
  const snapped = Math.floor(overlap * frameRate.value + 0.000001) / frameRate.value;
  if (snapped < frameDuration) { previewError.value = "片段至少需要两帧才能应用一帧转场"; return; }
  const targetStart = frameTime(outgoing.start + outgoingDuration - snapped);
  const delta = targetStart - incoming.start;
  const followers = clips.value.filter(item => item.id !== outgoing.id && item.id !== incoming.id && item.track === clip.track && item.start > incoming.start + 0.000001);
  if (followers.some(item => item.start + delta < -0.000001 || item.start + delta + clipDuration(item) > 86400.000001)) { previewError.value = "转场会使后续片段超出时间线边界"; return; }
  saveHistory();
  outgoing.transitionOut = snapped;
  incoming.transitionIn = snapped;
  incoming.start = targetStart;
  for (const follower of followers) follower.start = frameTime(follower.start + delta);
  clampFades(outgoing);
  clampFades(incoming);
  scheduleSave();
}
function clearCrossfade() {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  const frameDuration = 1 / frameRate.value;
  const previous = clips.value.filter(item => item.id !== clip.id && crossfadeDuration(item, clip, frameDuration) !== undefined).sort((a, b) => b.start - a.start)[0];
  const next = clips.value.filter(item => item.id !== clip.id && crossfadeDuration(clip, item, frameDuration) !== undefined).sort((a, b) => a.start - b.start)[0];
  if (!previous && !next && !(clip.transitionIn || clip.transitionOut)) return;
  const updates = new Map(clips.value.map(item => [item.id, { ...item }]));
  const clearPair = (outgoing: EditorClip, incoming: EditorClip) => {
    const beforeStart = incoming.start;
    const targetStart = Math.round((outgoing.start + clipDuration(outgoing)) * frameRate.value) / frameRate.value;
    const delta = targetStart - beforeStart;
    outgoing.transitionOut = 0;
    incoming.transitionIn = 0;
    incoming.start = targetStart;
    for (const follower of updates.values()) {
      if (follower.id !== outgoing.id && follower.id !== incoming.id && follower.track === incoming.track && follower.start > beforeStart + 0.000001) follower.start = Math.round((follower.start + delta) * frameRate.value) / frameRate.value;
    }
  };
  const changedClip = updates.get(clip.id)!;
  if (previous) clearPair(updates.get(previous.id)!, changedClip);
  if (next) clearPair(changedClip, updates.get(next.id)!);
  if (!previous && !next) {
    changedClip.transitionIn = 0;
    changedClip.transitionOut = 0;
  }
  if ([...updates.values()].some(item => item.start < -0.000001 || item.start + clipDuration(item) > 86400.000001)) { previewError.value = "清除转场会使后续片段超出时间线边界"; return; }
  saveHistory();
  for (const item of clips.value) Object.assign(item, updates.get(item.id)!);
  scheduleSave();
}
function splitSelectedClip() {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  const time = frameTime(currentTime.value);
  const sourcePoint = clip.inPoint + (time - clip.start) * (clip.speed ?? 1);
  const minimum = (clip.speed ?? 1) / frameRate.value;
  if (sourcePoint < clip.inPoint + minimum - .000001 || sourcePoint > clip.outPoint - minimum + .000001) return;
  saveHistory();
  const splitTime = time - clip.start;
  const next = { ...clip, keyframes: sliceClipKeyframes(clip, splitTime, clipDuration(clip)), id: crypto.randomUUID(), title: `${clip.title}（后段）`, start: time, inPoint: sourcePoint };
  clip.keyframes = sliceClipKeyframes(clip, 0, splitTime);
  clip.outPoint = sourcePoint;
  clampFades(clip);
  clampFades(next);
  clips.value.push(next);
  selectedClipId.value = next.id;
}
function assetDuration(clip: EditorClip) { return clip.kind === "text" || clip.kind === "image" ? Number.MAX_VALUE : assets.value.find(asset => asset.id === clip.assetId)?.duration ?? clip.outPoint; }
function updateSelectedClip(field: NumericField, event: Event) {
  const clip = selectedClip.value;
  const input = event.currentTarget as HTMLInputElement;
  const value = Number(input.value);
  if (!canEdit.value || !clip || isLocked(clip) || !input.value.trim() || !Number.isFinite(value)) { if (clip) input.value = String(clip[field] ?? 0); return; }
  saveHistory();
  const minDuration = (clip.speed ?? 1) / frameRate.value;
  const previousClip = { ...clip };
  if (field === "start") clip.start = Math.min(frameTime(value), 86400 - clipDuration(clip));
  else if (field === "inPoint") clip.inPoint = Math.min(Math.max(clip.outPoint - Math.max(0, 86400 - clip.start) * (clip.speed ?? 1), Math.max(0, frameTime(value))), Math.max(0, clip.outPoint - minDuration));
  else if (field === "outPoint") clip.outPoint = Math.min(Math.max(clip.inPoint + minDuration, frameTime(value)), assetDuration(clip), clip.inPoint + Math.max(0, 86400 - clip.start) * (clip.speed ?? 1));
  else {
    const limits: Record<string, [number, number]> = { volume: [0, 2], gainDb: [-60, 24], speed: [.25, 4], x: [-200, 200], y: [-200, 200], scale: [.1, 5], rotation: [-360, 360], opacity: [0, 1], brightness: [0, 3], contrast: [0, 3], saturation: [0, 3], fadeIn: [0, clipDuration(clip)], fadeOut: [0, clipDuration(clip)], transitionIn: [0, clipDuration(clip) / 2], transitionOut: [0, clipDuration(clip) / 2], fontSize: [1, 20], textX: [0, 100], textY: [0, 100] };
    const [min, max] = limits[field]!;
    clip[field] = Math.min(max, Math.max(min, value));
  }
  if (clipDuration(clip) > 86400 || clip.start + clipDuration(clip) > 86400) {
    Object.assign(clip, previousClip);
    previewError.value = "片段时间不能超出 24 小时";
    input.value = String(clip[field] ?? 0);
    return;
  }
  clampFades(clip);
  if (field === "inPoint" || field === "outPoint") {
    const offset = (clip.inPoint - previousClip.inPoint) / (previousClip.speed ?? 1);
    clip.keyframes = sliceClipKeyframes(previousClip, offset, offset + clipDuration(clip));
  } else if (field === "speed" && previousClip.keyframes) {
    const ratio = (previousClip.speed ?? 1) / (clip.speed ?? 1);
    clip.keyframes = previousClip.keyframes.map(frame => ({ ...frame, time: Math.min(clipDuration(clip), frame.time * ratio) }));
  }
  clip.start = Math.min(clip.start, 86400 - clipDuration(clip));
  input.value = String(clip[field]);
}
function updateSelectedText(event: Event) {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  saveHistory();
  clip.text = (event.currentTarget as HTMLTextAreaElement).value;
  clip.title = clip.text.trim().slice(0, 24) || "文字片段";
}
function updateTextColor(event: Event) {
  const clip = selectedClip.value;
  if (!canEdit.value || !clip || isLocked(clip)) return;
  saveHistory();
  clip.textColor = (event.currentTarget as HTMLInputElement).value;
}
function changeSetting(field: "aspectRatio" | "frameRate" | "exportHeight" | "exportQuality", event: Event) {
  if (!canEdit.value) return;
  saveHistory();
  const value = (event.currentTarget as HTMLSelectElement).value;
  if (field === "aspectRatio") aspectRatio.value = value;
  else if (field === "frameRate") frameRate.value = Number(value);
  else if (field === "exportHeight") exportHeight.value = Number(value) as EditorProject["exportHeight"];
  else exportQuality.value = value as EditorProject["exportQuality"];
}
function startClipDrag(event: PointerEvent, clip: EditorClip, edge?: "left" | "right") {
  previewMode.value = "program";
  selectedClipId.value = clip.id;
  if (event.button !== 0 || !canEdit.value || isLocked(clip)) return;
  stopPlayback();
  dragState = { clipId: clip.id, element: (event.currentTarget as HTMLElement).closest<HTMLElement>(".timelineClip") ?? undefined, startX: event.clientX, startY: event.clientY, start: clip.start, inPoint: clip.inPoint, outPoint: clip.outPoint, keyframes: clip.keyframes?.map(frame => ({ ...frame })), track: clip.track, edge, mode: editMode.value, clips: JSON.parse(JSON.stringify(clips.value)) };
  dragState.element?.setPointerCapture(event.pointerId);
  beginPointerTracking();
}
function startPlayheadDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  stopPlayback();
  dragState = { startX: event.clientX, startY: event.clientY, playhead: true };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  beginPointerTracking();
}
function beginPointerTracking() {
  releaseDragEvents?.();
  const move = (event: PointerEvent) => {
    const state = dragState;
    if (!state) return;
    if (state.playhead) { seekFromClient(event.clientX); return; }
    if (!canEdit.value) return;
    const clip = clips.value.find(item => item.id === state.clipId);
    if (!clip || isLocked(clip)) return;
    if (!state.historySaved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 3) return;
    const speed = clip.speed ?? 1;
    const delta = frameTime(Math.abs(event.clientX - state.startX) / zoom.value) * Math.sign(event.clientX - state.startX);
    if (state.clips && state.mode !== "select" && (state.mode === "slip" || state.edge)) {
      if (delta === 0) {
        if (state.historySaved) clips.value = JSON.parse(JSON.stringify(state.clips));
        editError.value = "";
        return;
      }
      try {
        const context = timelineEditContext(state.clips);
        let next: EditorClip[];
        if (state.mode === "slip") next = slipEditClip(context, clip.id, delta);
        else if (state.mode === "roll") {
          const original = state.clips.find(item => item.id === clip.id)!;
          const adjacent = adjacentRollClip(state.clips, original, state.edge!);
          next = rollEditClips(context, state.edge === "left" ? adjacent.id : clip.id, state.edge === "left" ? clip.id : adjacent.id, delta);
        } else next = rippleTrimClip(context, clip.id, state.edge!, delta);
        if (!state.historySaved) { saveHistory(); state.historySaved = true; }
        clips.value = next;
        editError.value = "";
      } catch (error) { editError.value = errorMessage(error, "此位置无法执行剪辑"); }
      return;
    }
    if (!state.historySaved) { saveHistory(); state.historySaved = true; }
    const minimum = speed / frameRate.value;
    if (state.edge === "left") {
      const bounded = Math.max(-state.start!, -state.inPoint! / speed, Math.min(delta, (state.outPoint! - state.inPoint! - minimum) / speed));
      clip.inPoint = state.inPoint! + bounded * speed;
      clip.start = state.start! + bounded;
    } else if (state.edge === "right") clip.outPoint = Math.min(assetDuration(clip), clip.inPoint + Math.max(0, 86400 - clip.start) * speed, Math.max(clip.inPoint + minimum, state.outPoint! + delta * speed));
    else {
      const next = Math.max(0, state.start! + delta);
      clip.start = Math.min(86400 - clipDuration(clip), Math.max(0, snapEnabled.value ? snapTime(next, clip) : frameTime(next)));
      const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-track-id]");
      const track = tracks.value.find(item => item.id === element?.dataset.trackId);
      if (track && !track.locked && track.kind === clipTrackKind(clip)) clip.track = track.id;
    }
    if (state.edge) {
      const original = state.clips!.find(item => item.id === clip.id)!;
      const offset = (clip.inPoint - original.inPoint) / speed;
      clip.keyframes = sliceClipKeyframes(original, offset, offset + clipDuration(clip));
      clip.fadeIn = original.fadeIn;
      clip.fadeOut = original.fadeOut;
    }
    clampFades(clip);
  };
  const up = () => {
    const state = dragState;
    if (state?.historySaved && state.clipId) {
      draggedClipId = state.clipId;
      window.setTimeout(() => { if (draggedClipId === state.clipId) draggedClipId = undefined; }, 0);
    } else draggedClipId = undefined;
    dragState = undefined;
    releaseDragEvents?.();
    releaseDragEvents = undefined;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", up, { once: true });
  releaseDragEvents = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
}
function snapTime(value: number, clip: EditorClip) {
  const edges = [0, currentTime.value, ...clips.value.filter(item => item.id !== clip.id).flatMap(item => [item.start, item.start + clipDuration(item)])];
  const candidates = edges.flatMap(edge => [edge, edge - clipDuration(clip)]).filter(time => time >= 0);
  const closest = candidates.reduce((best, time) => Math.abs(time - value) < Math.abs(best - value) ? time : best);
  return frameTime(Math.abs(closest - value) <= 8 / zoom.value ? closest : value);
}
function seekTimeline(event: PointerEvent) { if (!(event.target as HTMLElement).closest(".timelineClip, .trackLabel")) { stopPlayback(); seekFromClient(event.clientX); } }
function seekFromClient(clientX: number) {
  const viewport = timelineViewport.value;
  if (viewport) seekTo((clientX - viewport.getBoundingClientRect().left + viewport.scrollLeft - trackLabelWidth) / zoom.value);
}
function seekTo(value: number) { currentTime.value = Math.min(timelineDuration.value, frameTime(value)); syncPlayers(); }
function stepFrame(delta: number) { stopPlayback(); seekTo(currentTime.value + delta / frameRate.value); }
function fitTimeline() {
  const width = (timelineViewport.value?.clientWidth ?? 1000) - trackLabelWidth - 25;
  zoom.value = Math.max(.2, Math.min(100, width / Math.max(1, timelineDuration.value)));
  if (timelineViewport.value) timelineViewport.value.scrollLeft = 0;
}
function dragAsset(event: DragEvent, asset: EditorAsset) {
  if (!canEdit.value) { event.preventDefault(); return; }
  event.dataTransfer?.setData("application/x-editor-asset", asset.id);
}
function dropOnTrack(event: DragEvent, track: EditorTrack) {
  if (track.locked || !canEdit.value) return;
  const asset = assets.value.find(item => item.id === event.dataTransfer?.getData("application/x-editor-asset"));
  if (!asset || track.kind !== (asset.kind === "image" ? "video" : asset.kind)) return;
  const content = (event.currentTarget as HTMLElement).querySelector(".trackContent")!;
  addAssetToTimeline(asset, Math.max(0, (event.clientX - content.getBoundingClientRect().left) / zoom.value), track.id);
}
async function analyzeSelectedAudio() {
  const clip = selectedClip.value;
  const asset = assets.value.find(item => item.id === clip?.assetId);
  const context = projectContext;
  if (!clip || !asset || !context || !selectedClipHasAudio.value || !canEdit.value || isLocked(clip) || loudnessBusy.value) return;
  const version = projectVersion;
  const clipContent = JSON.stringify(clip);
  const session = getSessionSnapshot();
  const controller = new AbortController();
  loudnessController.value = controller;
  loudnessBusy.value = true;
  loudnessNotice.value = "";
  loudnessError.value = "";
  const signal = AbortSignal.any([controller.signal, session.signal]);
  try {
    const { data } = await axios.post<ApiResponse<AudioLoudnessResult>>("/api/videoEditor/audio/analyze", {
      directory: context.directory, path: asset.path, inPoint: clip.inPoint, outPoint: clip.outPoint, speed: clip.speed ?? 1, targetLufs: targetLoudness.value,
    }, { signal });
    if (signal.aborted || !mounted || version !== projectVersion || context !== projectContext || getSessionSnapshot().revision !== session.revision) return;
    if (selectedClip.value !== clip || JSON.stringify(clip) !== clipContent || !assets.value.some(item => item.id === asset.id && item.path === asset.path) || !canEdit.value || isLocked(clip)) throw new Error("片段或工程已变化，未应用旧的响度结果，请重新测量");
    const result = data.data;
    if (!result || [result.integratedLufs, result.truePeakDb, result.gainDb, result.expectedLufs].some(value => !Number.isFinite(value)) || result.gainDb < -60 || result.gainDb > 24 || !/^[\da-f]{64}$/i.test(result.hash)) throw new Error("响度测量结果无效，未修改片段");
    saveHistory();
    clip.gainDb = result.gainDb;
    loudnessNotice.value = `原始 ${result.integratedLufs.toFixed(1)} LUFS · 真峰值 ${result.truePeakDb.toFixed(1)} dBTP；已设置 ${result.gainDb >= 0 ? "+" : ""}${result.gainDb.toFixed(1)} dB，预计 ${result.expectedLufs.toFixed(1)} LUFS${result.limited ? "。受真峰值或最大增益限制，未达到目标" : ""}。后续音量、关键帧和混音会改变最终响度。`;
  } catch (error) {
    if (!signal.aborted && mounted && version === projectVersion && context === projectContext) loudnessError.value = errorMessage(error, "响度测量失败");
  } finally {
    if (loudnessController.value === controller) { loudnessBusy.value = false; loudnessController.value = undefined; }
  }
}
function audioLevel(clip: EditorClip, timelineTime: number) {
  const track = tracks.value.find(item => item.id === clip.track);
  if (!trackAudioEnabled(track, tracks.value)) return 0;
  return clipKeyframeValue(clip, "volume", timelineTime - clip.start) * 10 ** ((clip.gainDb ?? 0) / 20) * (track?.volume ?? 1) * fadeLevel(clip, true, timelineTime);
}
function updateAudioMeter() {
  if (!isPlaying.value || !audioAnalysers.length || !audioMeterSamples) { audioPeakDb.value = -60; return; }
  let peak = 0;
  for (const analyser of audioAnalysers) {
    analyser.getFloatTimeDomainData(audioMeterSamples);
    for (const sample of audioMeterSamples) peak = Math.max(peak, Math.abs(sample));
  }
  audioPeakDb.value = Math.max(-60, 20 * Math.log10(Math.max(peak, .000001)));
  audioPeakHoldDb.value = Math.max(audioPeakHoldDb.value, audioPeakDb.value);
}
async function togglePlayback() {
  if (!timelineDuration.value || !projectReady.value) return;
  if (previewMode.value === "source") {
    previewMode.value = "program";
    await nextTick();
    if (!mounted || previewMode.value !== "program" || !timelineDuration.value || !projectReady.value) return;
  }
  if (currentTime.value >= timelineDuration.value) currentTime.value = 0;
  isPlaying.value = !isPlaying.value;
  playbackTime = performance.now();
  if (isPlaying.value) {
    audioPeakHoldDb.value = -60;
    if (!audioContext) {
      audioContext = new AudioContext();
      audioBus = audioContext.createGain();
      audioBus.channelCount = 2;
      audioBus.channelCountMode = "explicit";
      audioBus.connect(audioContext.destination);
      audioSplitter = audioContext.createChannelSplitter(2);
      audioBus.connect(audioSplitter);
      // 分声道取峰值，避免立体声下混成单声道时反相抵消而低报电平。
      for (let channel = 0; channel < 2; channel++) {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        audioSplitter.connect(analyser, channel);
        audioAnalysers.push(analyser);
      }
      audioMeterSamples = new Float32Array(2048);
    }
    void audioContext.resume();
  }
  syncPlayers();
}
function stopPlayback() { isPlaying.value = false; audioPeakDb.value = -60; for (const media of [...videoElements.values(), ...audioElements.values()]) media.pause(); }
function syncPlayers() {
  for (const [id, element] of videoElements) syncElement(id, element, false);
  for (const [id, element] of audioElements) syncElement(id, element, true);
}
function syncElement(id: string, element: HTMLMediaElement, sound: boolean) {
  const clip = activeClips.value.find(item => item.id === id);
  if (!clip || !Number.isFinite(element.duration)) { element.pause(); return; }
  const speed = clip.speed ?? 1;
  const time = clip.inPoint + Math.max(0, currentTime.value - clip.start) * speed;
  if (Math.abs(element.currentTime - time) > (isPlaying.value ? .12 : .001)) element.currentTime = Math.min(time, Math.max(0, element.duration - .001));
  element.playbackRate = speed;
  if (sound) {
    const audio = element as HTMLAudioElement;
    const existing = audioNodes.get(id);
    if (existing && existing.element !== audio) {
      existing.source.disconnect();
      existing.gain.disconnect();
      audioNodes.delete(id);
    }
    if (audioContext && audioBus && !audioNodes.has(id)) {
      const source = audioSources.get(audio) ?? audioContext.createMediaElementSource(audio);
      audioSources.set(audio, source);
      const gain = audioContext.createGain();
      source.connect(gain);
      gain.connect(audioBus);
      audioNodes.set(id, { source, gain, element: audio });
    }
    const volume = audioLevel(clip, currentTime.value);
    const node = audioNodes.get(id);
    if (node && audioContext) {
      const now = audioContext.currentTime;
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(volume, now);
      if (isPlaying.value) node.gain.gain.linearRampToValueAtTime(audioLevel(clip, currentTime.value + .025), now + .025);
      element.volume = 1;
    }
    else element.volume = Math.min(1, volume);
  }
  if (isPlaying.value && element.paused) void element.play().catch(error => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    stopPlayback(); previewError.value = `「${clip.title}」播放失败，请确认媒体编码受浏览器支持。`;
  });
  else if (!isPlaying.value && !element.paused) element.pause();
}
function setVideoElement(id: string, element: unknown) {
  if (element instanceof HTMLVideoElement) { videoElements.set(id, element); syncElement(id, element, false); }
  else { videoElements.get(id)?.pause(); videoElements.delete(id); }
}
function setAudioElement(id: string, element: unknown) {
  if (element instanceof HTMLAudioElement) { audioElements.set(id, element); syncElement(id, element, true); }
  else {
    audioElements.get(id)?.pause(); audioElements.delete(id);
    const node = audioNodes.get(id);
    node?.source.disconnect(); node?.gain.disconnect(); audioNodes.delete(id);
  }
}

async function importFiles(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const incoming = [...(input.files ?? [])]; input.value = "";
  await importMedia(incoming);
}
async function dropFiles(event: DragEvent) { await importMedia([...(event.dataTransfer?.files ?? [])]); }
function fileKind(file: File): MediaKind {
  if (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) return "image";
  if (file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) return "video";
  if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) return "audio";
  throw new Error(`不支持「${file.name}」，请选择视频、音频或 PNG/JPEG/WebP 图片`);
}
async function importMedia(incoming: File[], replaceId?: string) {
  const context = projectContext;
  if (!canEdit.value || !context || !incoming.length) return;
  const version = projectVersion;
  importBusy.value = true;
  importProgress.value = 0;
  previewError.value = "";
  stopPlayback();
  const controller = new AbortController();
  importController.value = controller;
  const files = useWorkspaceFiles(context.directory);
  try {
    await ensureEditorFolders(files);
    for (const [index, file] of incoming.entries()) {
      controller.signal.throwIfAborted();
      if (!file.size || file.size > 8 * 1024 ** 3) throw new Error("媒体文件须大于 0 字节且不超过 8 GiB");
      const kind = fileKind(file);
      importLabel.value = `导入 ${index + 1}/${incoming.length} · ${file.name}`;
      const metadata = await readMediaMetadata(file, kind, controller.signal);
      const existing = assets.value.find(asset => asset.id === replaceId);
      if (existing && (kind !== existing.kind || (kind !== "image" && clips.value.some(clip => clip.assetId === existing.id && clip.outPoint > metadata.duration + .000001)))) throw new Error("重链接素材类型必须一致，时长不能短于已使用的出点");
      const id = crypto.randomUUID();
      const safeName = file.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "") || `${kind}.dat`;
      const path = `assets/videoEditor/media/${id}-${safeName}`;
      await files.upload(path, file, { signal: controller.signal, onProgress: percent => { if (version === projectVersion) importProgress.value = percent; } });
      if (version !== projectVersion || projectContext !== context) { await files.remove(path); return; }
      saveHistory();
      const asset = { id: existing?.id ?? id, name: file.name, path, kind, size: file.size, ...metadata };
      if (existing) assets.value.splice(assets.value.indexOf(existing), 1, asset);
      else assets.value.push(asset);
      missingAssetIds.value = missingAssetIds.value.filter(item => item !== asset.id);
    }
  } catch (error) {
    if (version === projectVersion) previewError.value = controller.signal.aborted ? "已取消导入，已完成的素材已保留。" : errorMessage(error, "导入素材失败");
  } finally {
    if (version === projectVersion) { importBusy.value = false; importController.value = undefined; }
  }
}
function readMediaMetadata(file: File, kind: MediaKind, signal: AbortSignal): Promise<{ duration: number; width?: number; height?: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = kind === "image" ? new Image() : kind === "video" ? document.createElement("video") : new Audio();
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      const dimensions = element instanceof HTMLImageElement ? { width: element.naturalWidth, height: element.naturalHeight } : element instanceof HTMLVideoElement ? { width: element.videoWidth, height: element.videoHeight } : {};
      const duration = element instanceof HTMLImageElement ? 5 : element.duration;
      element.removeAttribute("src");
      if (element instanceof HTMLMediaElement) element.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else if (!Number.isFinite(duration) || duration <= 0) reject(new Error(`无法读取「${file.name}」的时长`));
      else if (duration > 86400) reject(new Error("素材时长不能超过 24 小时"));
      else resolve({ duration, ...dimensions });
    };
    const abort = () => finish(new DOMException("已取消导入", "AbortError"));
    const timeout = setTimeout(() => finish(new Error("读取素材信息超时")), 30000);
    signal.addEventListener("abort", abort, { once: true });
    if (element instanceof HTMLImageElement) element.onload = () => finish();
    else { element.preload = "metadata"; element.onloadedmetadata = () => finish(); }
    element.onerror = () => finish(new Error(`浏览器无法解码「${file.name}」，请转换为 H.264/AAC MP4、WAV 或标准图片格式`));
    if (signal.aborted) abort(); else element.src = url;
  });
}
function chooseRelink(asset: EditorAsset) { relinkAssetId = asset.id; relinkInput.value?.click(); }
async function relinkFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; input.value = "";
  if (file && relinkAssetId) await importMedia([file], relinkAssetId);
  relinkAssetId = undefined;
}
async function importSubtitles(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; input.value = "";
  if (!file || !canEdit.value) return;
  const version = projectVersion;
  try {
    if (file.size > 5 * 1024 ** 2) throw new Error("字幕文件不能超过 5 MB");
    const cues = parseSubtitles(await file.text());
    if (version !== projectVersion) return;
    saveHistory();
    const track = writableTrack("text");
    clips.value.push(...cues.map(cue => ({ id: crypto.randomUUID(), title: cue.text.slice(0, 24), kind: "text" as const, track: track.id, start: cue.start, inPoint: 0, outPoint: cue.end - cue.start, volume: 1, text: cue.text })));
  } catch (error) { previewError.value = errorMessage(error, "导入字幕失败"); }
}
function exportSubtitles(format: "srt" | "vtt") {
  try {
    const content = serializeSubtitles(clips.value.filter(clip => !tracks.value.find(track => track.id === clip.track)?.hidden), format);
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    downloadUrl(url, `subtitles.${format}`);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) { previewError.value = errorMessage(error, "导出字幕失败"); }
}
async function importEdlFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0]; input.value = "";
  if (!file || !canEdit.value) return;
  const version = projectVersion;
  try {
    if (file.size > 2 * 1024 ** 2) throw new Error("EDL 文件不能超过 2 MiB");
    if (tracks.value.some(track => track.kind === "video" && track.locked)) throw new Error("请先解锁视频轨道再导入 EDL");
    const imported = importEdl(await file.text(), getProject());
    if (version !== projectVersion || !canEdit.value) return;
    if (clips.value.some(clip => clip.kind === "video" || clip.kind === "image") && !window.confirm("EDL 将替换当前画面剪辑，音频与文字片段会保留。是否继续？")) return;
    stopPlayback();
    saveHistory();
    clips.value = imported.clips;
    selectedClipId.value = undefined;
    scheduleSave();
  } catch (error) { previewError.value = errorMessage(error, "导入 EDL 失败"); }
}
function exportEdlFile() {
  try {
    const content = exportEdl(getProject());
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    downloadUrl(url, `${editorProjectName.value}.edl`);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) { previewError.value = errorMessage(error, "导出 EDL 失败"); }
}
async function checkMedia() {
  const context = projectContext;
  if (!context) return;
  const snapshot = assets.value.map(asset => ({ ...asset }));
  const files = useWorkspaceFiles(context.directory);
  const folders = new Map<string, Set<string>>();
  const missing: string[] = [];
  for (const asset of snapshot) {
    const parent = asset.path.slice(0, asset.path.lastIndexOf("/"));
    try {
      let paths = folders.get(parent);
      if (!paths) { paths = new Set((await files.list(parent)).entries.filter(entry => entry.type === "file").map(entry => entry.path)); folders.set(parent, paths); }
      if (!paths.has(asset.path)) missing.push(asset.id);
    } catch (error) {
      if (httpStatus(error) === 404) missing.push(asset.id);
      else { if (projectContext === context) previewError.value = errorMessage(error, "无法检查素材"); return; }
    }
  }
  if (projectContext === context && snapshot.every(asset => assets.value.some(current => current.id === asset.id && current.path === asset.path))) missingAssetIds.value = missing;
}
function selectedEditorProjectPath(directory: string) {
  try {
    const value = localStorage.getItem(`omnistudioEditorProject:${getSessionSnapshot().userId}:${directory}`);
    return value === legacyEditorProjectPath || /^assets\/videoEditor\/projects\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.json$/.test(value ?? "") ? value! : legacyEditorProjectPath;
  } catch { return legacyEditorProjectPath; }
}
function returnFromEditor() {
  if (!isProductionEditor.value) { void router.push("/workspace"); return; }
  const projectId = productionProjectId.value;
  if (!projectId || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(projectId)) { void router.push("/productionProjects"); return; }
  void router.push({ path: `/productionProjects/${projectId}`, query: { stage: "generating" } });
}
async function openProductionEditorProject(projectDirectory: string | undefined, bindingKey: string) {
  const version = projectVersion;
  projectLoading.value = true;
  try {
    const projectId = productionProjectId.value;
    const episodeId = productionEpisodeId.value;
    if (!projectId || !episodeId) throw new Error("从生产项目剪辑需要指定剧集");
    if (!projectDirectory) throw new Error("当前账户的个人工作区尚未就绪，请重新打开生产项目");
    if (sourceCanvasPath.value) throw new Error("剪辑台不能同时绑定画布与生产项目，请从对应入口重新打开。");
    const { data } = await axios.get<ApiResponse<ProductionEditorPayload>>("/api/productionProjects/get", { params: { projectId } });
    if (data.data.project.id.toLowerCase() !== projectId.toLowerCase()) throw new Error("生产项目编号与服务端返回不一致");
    const episode = data.data.episodes.find(item => item.id.toLowerCase() === episodeId.toLowerCase());
    if (!episode) throw new Error("所选剧集不属于当前生产项目");
    if (version !== projectVersion || !isSameDirectory(directory.value, projectDirectory) || bindingKey !== productionBindingKey.value || !mounted) return;
    const resolved = await resolveProductionEditorProject(
      projectDirectory,
      projectId,
      episodeId,
      data.data.project.title,
      episode.title,
    );
    if (version !== projectVersion || !isSameDirectory(directory.value, projectDirectory) || bindingKey !== productionBindingKey.value || !mounted) return;
    activeEditorProjectPath.value = resolved.path;
    boundProductionProjectPath.value = resolved.path;
    productionEditorTitle.value = `${data.data.project.title} · ${episode.title}`;
    await loadProject(projectDirectory, resolved.path);
  } catch (error) {
    if (version === projectVersion && isSameDirectory(directory.value, projectDirectory) && bindingKey === productionBindingKey.value) {
      saveError.value = errorMessage(error, "恢复生产项目剪辑工程失败");
      projectLoading.value = false;
    }
  }
}
async function openCanvasEditorProject(projectDirectory: string | undefined, canvasPath: string) {
  const version = projectVersion;
  projectLoading.value = true;
  try {
    const sourceDirectory = queryString(route.query.sourceDirectory);
    if (!sourceDirectory) throw new Error("缺少画布来源工作区，请从原画布重新打开剪辑台");
    if (!isSameDirectory(sourceDirectory, projectDirectory)) {
      await workspaceStore.openProject(sourceDirectory, sourceDirectory, getSessionSnapshot().signal);
      return;
    }
    if (!projectDirectory) throw new Error("请先打开来源工作区");
    const resolved = await resolveCanvasEditorProject(projectDirectory, canvasPath);
    if (version !== projectVersion || directory.value !== projectDirectory || activeCanvasPath.value !== canvasPath || !mounted) return;
    if (resolved.candidates) {
      canvasProjectCandidates.value = resolved.candidates;
      editorProjectOptions.value = resolved.candidates;
      editorProjectsOpen.value = true;
      projectLoading.value = false;
      return;
    }
    activeEditorProjectPath.value = resolved.path;
    boundCanvasProjectPath.value = resolved.path;
    rememberEditorProjectPath(projectDirectory, resolved.path);
    await loadProject(projectDirectory, resolved.path);
  } catch (error) {
    if (version === projectVersion && directory.value === projectDirectory && activeCanvasPath.value === canvasPath) {
      saveError.value = errorMessage(error, "恢复画布剪辑工程失败");
      projectLoading.value = false;
    }
  }
}
function rememberEditorProjectPath(projectDirectory: string, path: string) {
  try { localStorage.setItem(`omnistudioEditorProject:${getSessionSnapshot().userId}:${projectDirectory}`, path); }
  catch (error) { console.warn("当前剪辑工程无法记入本地偏好", error); }
}
async function loadProject(path: string, editorPath = activeEditorProjectPath.value) {
  const version = projectVersion;
  const userId = getSessionSnapshot().userId;
  projectLoading.value = true;
  try {
    const loaded = await loadEditorProject(path, editorPath);
    if (version !== projectVersion || directory.value !== path || activeEditorProjectPath.value !== editorPath || getSessionSnapshot().userId !== userId || !mounted) return;
    const draftKey = `omnistudioEditorDraft:${userId}:${path}:${editorPath}`;
    projectContext = { directory: path, projectPath: editorPath, revision: loaded.revision, content: loaded.content, draftKey: `${draftKey}:${crypto.randomUUID()}`, sequence: 0, blocked: false };
    applyProject(loaded.project);
    loadedDirectory.value = path;
    projectLoading.value = false;
    saveBlocked.value = false;
    saveError.value = "";
    const context = projectContext;
    window.setTimeout(() => {
      if (!mounted || version !== projectVersion || projectContext !== context || directory.value !== path || activeEditorProjectPath.value !== editorPath || getSessionSnapshot().userId !== userId) return;
      try {
        const currentContent = getProjectContent();
        const loadedContent = JSON.stringify(loaded.project);
        const draftCandidates = Object.keys(localStorage).filter(key => key === draftKey || key.startsWith(`${draftKey}:`)).map(key => {
          try {
            const draft = JSON.parse(localStorage.getItem(key) ?? "null");
            const draftProject = parseEditorProject(JSON.parse(draft.content));
            const draftContent = JSON.stringify(draftProject);
            if (key === context.draftKey || draftContent === loadedContent || draftContent === currentContent) return undefined;
            return { key, revision: String(draft.revision), content: draft.content as string, updatedAt: Number(draft.updatedAt) || 0 };
          } catch { return undefined; }
        }).filter(item => item !== undefined).sort((a, b) => b.updatedAt - a.updatedAt);
        recoverableDraft.value = draftCandidates[0];
        draftAvailable.value = !!recoverableDraft.value;
      } catch { previewError.value = "本地草稿无法读取，工程文件保持完整。"; }
      void checkMedia();
      void restoreLastExport(context);
    }, 0);
  } catch (error) {
    if (version === projectVersion && directory.value === path && activeEditorProjectPath.value === editorPath && getSessionSnapshot().userId === userId) { saveError.value = errorMessage(error, "读取工程失败"); projectLoading.value = false; }
  }
}
function scheduleSave() {
  const context = projectContext;
  if (applyingProject || !context || !projectReady.value) return;
  const project = getProject();
  pendingSave = { context, project, sequence: ++saveSequence };
  context.sequence = saveSequence;
  savePending.value = true;
  try { localStorage.setItem(context.draftKey, JSON.stringify({ revision: context.revision, content: JSON.stringify(project), updatedAt: Date.now() })); }
  catch { saveError.value = "本地草稿空间不足，请保持页面打开并确认工程保存成功。"; }
  if (persistTimer) clearTimeout(persistTimer);
  if (!saveBlocked.value) persistTimer = setTimeout(() => { void saveProject(); }, 500);
}
function saveProject(): Promise<boolean> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  if (saveBlocked.value) return Promise.resolve(false);
  const pending = pendingSave;
  if (!pending) return saveQueue.then(() => !pendingSave && !saveBlocked.value);
  pendingSave = undefined;
  saveRequests++;
  saveBusy.value = true;
  saveQueue = saveQueue.then(async () => {
    try {
      if (pending.context.blocked) return false;
      const result = await saveEditorProject(pending.context.directory, pending.project, pending.context.revision, pending.context.content, pending.context.projectPath);
      pending.context.revision = result.revision;
      pending.context.content = result.content;
      if (projectContext === pending.context) {
        saveError.value = "";
        saveRetryable.value = false;
        if (pending.sequence === pending.context.sequence) {
          try { localStorage.removeItem(pending.context.draftKey); }
          catch (error) { console.warn("工程已保存，但本地草稿清理失败", error); }
        }
      }
      return true;
    } catch (error) {
      if (projectContext === pending.context) {
        const apiCode = (error as { response?: { data?: { data?: { code?: string } } } })?.response?.data?.data?.code;
        const temporarilyBusy = httpStatus(error) === 409 && apiCode === "EBUSY";
        saveError.value = errorMessage(error, "工程保存失败");
        saveRetryable.value = temporarilyBusy;
        saveBlocked.value = httpStatus(error) === 409 && !temporarilyBusy;
        pending.context.blocked = saveBlocked.value;
        if (pending.sequence === pending.context.sequence && (!pendingSave || pending.sequence > pendingSave.sequence)) pendingSave = pending;
      }
      return false;
    } finally {
      saveRequests--;
      saveBusy.value = saveRequests > 0;
      if (projectContext === pending.context) savePending.value = !!pendingSave;
    }
  });
  return saveQueue;
}
async function reloadProject() {
  const path = directory.value;
  if (!path || importBusy.value || sourceImportBusy.value || exportBusy.value || exportRecordBusy.value) return;
  stopPlayback();
  projectVersion++;
  clearEditor();
  if (isProductionEditor.value) {
    boundProductionProjectPath.value = undefined;
    productionEditorTitle.value = "";
    await openProductionEditorProject(path, productionBindingKey.value);
  }
  else if (activeCanvasPath.value) await openCanvasEditorProject(path, activeCanvasPath.value);
  else await loadProject(path);
}
async function openRecovery() {
  if (!directory.value || exportRecordBusy.value || isProductionEditor.value && !boundProductionProjectPath.value) return;
  const path = directory.value;
  const editorPath = activeEditorProjectPath.value;
  const version = projectVersion;
  const userId = getSessionSnapshot().userId;
  const requestVersion = ++recoveryRequestVersion;
  recoveryOpen.value = true;
  recoveryError.value = "";
  recoveryLoading.value = true;
  backups.value = [];
  selectedBackup.value = "";
  try {
    const result = await listEditorBackups(path, editorPath);
    if (requestVersion !== recoveryRequestVersion || !mounted || !recoveryOpen.value || version !== projectVersion || directory.value !== path || activeEditorProjectPath.value !== editorPath || getSessionSnapshot().userId !== userId) return;
    backups.value = result;
    selectedBackup.value = result[0]?.path ?? "";
  } catch (error) {
    if (requestVersion === recoveryRequestVersion && mounted && recoveryOpen.value && version === projectVersion && directory.value === path && activeEditorProjectPath.value === editorPath && getSessionSnapshot().userId === userId) recoveryError.value = errorMessage(error, "读取备份失败");
  } finally {
    if (requestVersion === recoveryRequestVersion && mounted && recoveryOpen.value && version === projectVersion && directory.value === path && activeEditorProjectPath.value === editorPath && getSessionSnapshot().userId === userId) recoveryLoading.value = false;
  }
}
async function restoreBackup() {
  const path = directory.value;
  const editorPath = activeEditorProjectPath.value;
  const backupPath = selectedBackup.value;
  const version = projectVersion;
  if (!path || !backupPath || importBusy.value || sourceImportBusy.value || exportBusy.value || exportRecordBusy.value || isProductionEditor.value && editorPath !== boundProductionProjectPath.value) return;
  projectLoading.value = true;
  try {
    if (!saveBlocked.value && pendingSave && !await saveProject()) throw new Error("当前工程保存失败，请先解决保存问题");
    const files = useWorkspaceFiles(path);
    const backup = await readEditorBackup(path, backupPath, editorPath);
    const current = await files.readVersionedText(editorPath);
    const preserved = current.content ? await backupEditorContent(path, current.content, editorPath) : undefined;
    if (version !== projectVersion || directory.value !== path) return;
    const restored = await saveEditorProject(path, backup, current.revision, "", editorPath);
    try { await pruneEditorBackups(path, preserved, editorPath); }
    catch (error) { console.warn("工程已恢复，但旧备份清理失败", error); }
    if (version !== projectVersion || directory.value !== path) return;
    pendingSave = undefined;
    savePending.value = false;
    projectContext = { directory: path, projectPath: editorPath, revision: restored.revision, content: restored.content, draftKey: `omnistudioEditorDraft:${getSessionSnapshot().userId}:${path}:${editorPath}:${crypto.randomUUID()}`, sequence: 0, blocked: false };
    applyProject(backup);
    loadedDirectory.value = path;
    undoStack.value = []; redoStack.value = [];
    saveBlocked.value = false; saveError.value = ""; saveRetryable.value = false;
    recoveryOpen.value = false;
    void checkMedia();
  } catch (error) { recoveryError.value = errorMessage(error, "恢复备份失败"); }
  finally { if (version === projectVersion) projectLoading.value = false; }
}
async function openEditorProjects() {
  if (!directory.value || projectBusy.value || exportRecordBusy.value || isProductionEditor.value && !boundProductionProjectPath.value) return;
  projectError.value = "";
  newEditorProjectName.value = "";
  try {
    if (isProductionEditor.value) {
      if (!boundProductionProjectPath.value) throw new Error("当前生产项目尚未恢复绑定工程，无法切换工程");
      const projects = await listEditorProjects(directory.value);
      editorProjectOptions.value = projects.filter(item => item.path === boundProductionProjectPath.value);
    } else editorProjectOptions.value = canvasProjectCandidates.value.length ? canvasProjectCandidates.value : await listEditorProjects(directory.value);
  }
  catch (error) { projectError.value = errorMessage(error, "读取剪辑工程失败"); }
  editorProjectsOpen.value = true;
}
async function selectEditorProject(path: string, fromCreate = false) {
  const projectDirectory = directory.value;
  if (!projectDirectory || sourceImportBusy.value || importBusy.value || exportBusy.value || exportRecordBusy.value || projectBusy.value && !fromCreate || path === activeEditorProjectPath.value && projectReady.value) return;
  if (isProductionEditor.value && !fromCreate && path !== boundProductionProjectPath.value) {
    projectError.value = "只能打开当前生产项目与剧集绑定的剪辑工程";
    return;
  }
  if (path !== legacyEditorProjectPath && !/^assets\/videoEditor\/projects\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.json$/.test(path)) {
    projectError.value = "剪辑工程路径无效";
    return;
  }
  projectBusy.value = true;
  projectError.value = "";
  const canvasPath = activeCanvasPath.value;
  const version = projectVersion;
  try {
    if (!saveBlocked.value && !await saveProject()) throw new Error("当前剪辑工程尚未保存，请先解决保存问题");
    if (projectDirectory !== directory.value || version !== projectVersion || !mounted) throw new Error("工作区已切换，请重新选择剪辑工程");
    if (isProductionEditor.value) {
      const projectId = productionProjectId.value;
      const episodeId = productionEpisodeId.value;
      if (!projectId || !episodeId) throw new Error("生产项目剪辑需要指定剧集");
      await bindProductionEditorProject(projectDirectory, projectId, episodeId, path, boundProductionProjectPath.value);
      if (projectDirectory !== directory.value || version !== projectVersion || !mounted) throw new Error("工作区已切换，请重新选择剪辑工程");
      boundProductionProjectPath.value = path;
    } else if (canvasPath) {
      await bindCanvasEditorProject(projectDirectory, canvasPath, path, boundCanvasProjectPath.value);
      if (projectDirectory !== directory.value || version !== projectVersion || !mounted) throw new Error("工作区已切换，请重新选择剪辑工程");
      boundCanvasProjectPath.value = path;
    }
    activeEditorProjectPath.value = path;
    if (!isProductionEditor.value) rememberEditorProjectPath(projectDirectory, path);
    canvasProjectCandidates.value = [];
    projectVersion++;
    stopPlayback();
    clearEditor();
    await loadProject(projectDirectory, path);
    if (loadedDirectory.value !== projectDirectory) throw new Error(saveError.value || "剪辑工程读取失败");
    editorProjectsOpen.value = false;
  } catch (error) { projectError.value = errorMessage(error, "切换剪辑工程失败"); }
  finally { projectBusy.value = false; }
}
async function createEditorProjectFromDialog() {
  const projectDirectory = directory.value;
  const name = newEditorProjectName.value.trim();
  if (!projectDirectory || !name || projectBusy.value || exportRecordBusy.value || isProductionEditor.value && !boundProductionProjectPath.value) return;
  const version = projectVersion;
  projectBusy.value = true;
  projectError.value = "";
  try {
    if (!saveBlocked.value && !await saveProject()) throw new Error("当前剪辑工程尚未保存，请先解决保存问题");
    if (directory.value !== projectDirectory || version !== projectVersion) throw new Error("工作区已切换，请重试");
    const created = await createEditorProjectFile(projectDirectory, name);
    editorProjectOptions.value = await listEditorProjects(projectDirectory);
    if (directory.value !== projectDirectory || version !== projectVersion) throw new Error("工作区已切换，工程已保留在原工作区");
    await selectEditorProject(created.path, true);
    newEditorProjectName.value = "";
  } catch (error) { projectError.value = errorMessage(error, "新建剪辑工程失败"); }
  finally { projectBusy.value = false; }
}
function restoreDraft() {
  const context = projectContext;
  if (!context || !canEdit.value) return;
  try {
    const draft = recoverableDraft.value;
    if (!draft) return;
    if (draft.revision !== context.revision && !window.confirm("草稿基于较旧版本。恢复后将以草稿内容保存，当前版本会先备份，是否恢复？")) return;
    const project = parseEditorProject(JSON.parse(draft.content));
    saveHistory();
    applyProject(project);
    draftAvailable.value = false;
    scheduleSave();
    void saveProject().then(saved => {
      if (saved) {
        try {
          const latestDraft = JSON.parse(localStorage.getItem(draft.key) ?? "null");
          if (latestDraft?.revision === draft.revision && latestDraft?.content === draft.content && latestDraft?.updatedAt === draft.updatedAt) localStorage.removeItem(draft.key);
        } catch (error) { console.warn("工程已恢复，但旧草稿清理失败", error); }
      }
    });
    void checkMedia();
  } catch (error) { previewError.value = errorMessage(error, "草稿恢复失败"); }
}
function discardDraft() {
  const draft = recoverableDraft.value;
  try {
    if (draft) {
      const latestDraft = JSON.parse(localStorage.getItem(draft.key) ?? "null");
      if (latestDraft && (latestDraft.revision !== draft.revision || latestDraft.content !== draft.content || latestDraft.updatedAt !== draft.updatedAt)) {
        parseEditorProject(JSON.parse(latestDraft.content));
        recoverableDraft.value = { key: draft.key, revision: String(latestDraft.revision), content: latestDraft.content, updatedAt: Number(latestDraft.updatedAt) || 0 };
        draftAvailable.value = true;
        return;
      }
      if (latestDraft) localStorage.removeItem(draft.key);
    }
    recoverableDraft.value = undefined;
    draftAvailable.value = false;
  }
  catch (error) { previewError.value = errorMessage(error, "清理本地草稿失败"); }
}
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!pendingSave && !saveBusy.value && !importBusy.value && !sourceImportBusy.value && !exportBusy.value && !exportRecordBusy.value) return;
  event.preventDefault(); event.returnValue = "";
}
function onEditorKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return;
  if (editorRoot.value?.querySelector("dialog[open], [popover]:popover-open")) return;
  if (event.key === "Escape") {
    if (inspectorOpen.value) closeInspector();
    else if (previewExpanded.value) togglePreviewExpanded();
    return;
  }
  if (recoveryOpen.value || editorProjectsOpen.value || mediaPickerOpen.value || !canEdit.value) return;
  if (dragState) { event.preventDefault(); return; }
  const target = event.target as HTMLElement;
  if (target?.closest("input, textarea, select, [role='separator'], .sourceMonitor, [contenteditable='true']")) return;
  if (event.code === "Space" && target?.closest("button:not(.timelineClip)")) return;
  if (event.code === "Space") { event.preventDefault(); void togglePlayback(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelectedClip(); }
  else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.shiftKey ? rippleDeleteSelected() : deleteSelectedClip(); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); stepFrame(event.key === "ArrowLeft" ? -1 : 1); }
  else if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); splitSelectedClip(); }
  else if (!event.ctrlKey && !event.metaKey && !event.altKey && ["v", "b", "n", "y"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    editMode.value = ({ v: "select", b: "ripple", n: "roll", y: "slip" } as const)[event.key.toLowerCase() as "v" | "b" | "n" | "y"];
  }
}
function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || (error instanceof Error ? error.message : fallback);
}
function httpStatus(error: unknown) { return (error as { response?: { status?: number } })?.response?.status; }
function downloadUrl(url: string, name: string) {
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
}
function workspaceRelativePath(value: unknown) {
  if (typeof value !== "string" || !value.trim() || /^[a-z][a-z\d+.-]*:/i.test(value) || /[\\:<>&"|?*\u0000-\u001f]/.test(value) || value.startsWith("/") || value.split("/").some(part => !part || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" "))) throw new Error("素材路径必须是工作区内的相对文件路径");
  return value;
}
function queryString(value: unknown) { return typeof value === "string" ? value : undefined; }
function queryIdList() {
  const raw = queryString(route.query.variantIds);
  let ids: unknown[];
  if (raw) {
    try { ids = JSON.parse(raw); }
    catch { throw new Error("项目候选列表格式无效"); }
    if (!Array.isArray(ids)) throw new Error("项目候选列表格式无效");
  } else ids = [route.query.variantId].filter(value => value !== undefined);
  if (ids.length > 200 || ids.some(id => typeof id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))) throw new Error("项目候选数量或编号无效");
  return [...new Set(ids as string[])];
}
function clearSourceImportQuery() {
  const query = { ...route.query };
  for (const key of ["canvasPath", "nodeIds", "variantIds", "variantId"]) delete query[key];
  if (activeCanvasPath.value) query.editorCanvasPath = activeCanvasPath.value;
  sourceImportError.value = "";
  retryPickedSource.value = undefined;
  pendingPickedAsset.value = undefined;
  void router.replace({ path: route.path, query });
}
async function removeImportedAssets(incoming: EditorAsset[], targetDirectory = directory.value) {
  if (!incoming.length || !targetDirectory) return;
  const files = useWorkspaceFiles(targetDirectory);
  await Promise.allSettled(incoming.map(asset => files.remove(asset.path)));
}
async function retrySourceImport() {
  if (exportRecordBusy.value) return;
  if (pendingPickedAsset.value) {
    sourceImportBusy.value = true;
    sourceImportError.value = "";
    try {
      if (!await saveProject()) throw new Error("工程保存失败，请解决保存问题后重试");
      pendingPickedAsset.value = undefined;
      sourceImportNotice.value = "素材已加入当前剪辑工程。";
    } catch (error) { sourceImportError.value = errorMessage(error, "工程保存失败"); }
    finally { sourceImportBusy.value = false; }
    return;
  }
  if (retryPickedSource.value) { await importPickedMedia(retryPickedSource.value); return; }
  if (pendingSourceImportKey.value === sourceImportKey.value && pendingSourceImportAssets.value.length) {
    sourceImportBusy.value = true;
    sourceImportError.value = "";
    try {
      if (!await saveProject()) throw new Error("工程保存失败，请解决保存问题后重试");
      pendingSourceImportKey.value = "";
      pendingSourceImportAssets.value = [];
      sourceImportNotice.value = "素材已加入当前剪辑工程。";
      clearSourceImportQuery();
    } catch (error) { sourceImportError.value = errorMessage(error, "工程保存失败"); }
    finally { sourceImportBusy.value = false; }
    return;
  }
  processedSourceImportKey.value = "";
  await importEditorSources();
}
async function importEditorSources() {
  const currentDirectory = directory.value;
  if (!currentDirectory || !projectReady.value || sourceImportBusy.value || exportRecordBusy.value) return;
  const key = sourceImportKey.value;
  if (processedSourceImportKey.value === key) return;
  processedSourceImportKey.value = key;
  sourceImportBusy.value = true;
  sourceImportError.value = "";
  sourceImportNotice.value = "";
  sourceImportLabel.value = "正在读取素材来源";
  const version = projectVersion;
  const isCurrent = () => mounted && version === projectVersion && currentDirectory === directory.value && key === sourceImportKey.value;
  const canvasIncoming: EditorAsset[] = [];
  const productionIncoming: EditorAsset[] = [];
  let applied = false;
  try {
    const canvasPath = queryString(route.query.canvasPath);
    const projectId = queryString(route.query.productionProjectId);
    const variantIds = queryIdList();
    if (canvasPath) {
      if (!isSameDirectory(queryString(route.query.sourceDirectory), currentDirectory)) throw new Error("画布与剪辑工程工作区不一致，请从原工作区重新打开剪辑台");
      workspaceRelativePath(canvasPath);
      if (!canvasPath.toLowerCase().endsWith(".json")) throw new Error("画布路径无效");
      const rawNodeIds = queryString(route.query.nodeIds);
      let nodeIds: string[] = [];
      if (rawNodeIds) {
        try {
          const parsed = JSON.parse(rawNodeIds) as unknown;
          if (!Array.isArray(parsed) || parsed.length > 500 || parsed.some(id => typeof id !== "string" || !id.trim() || id.length > 256)) throw new Error();
          nodeIds = [...new Set(parsed)];
        } catch { throw new Error("画布节点列表无效"); }
      }
      const canvas = await useWorkspaceFiles(currentDirectory).readJson<{ toonflowCanvas?: boolean; nodes?: { id?: string; data?: { label?: string; outputs?: Record<string, { dataType?: string; value?: { url?: unknown } } | undefined> } }[] }>(canvasPath);
      if (!isCurrent()) { await removeImportedAssets(canvasIncoming, currentDirectory); return; }
      if (canvas?.toonflowCanvas !== true || !Array.isArray(canvas.nodes) || canvas.nodes.length > 10000) throw new Error("画布文件格式无效");
      const selected = new Set(nodeIds);
      const sources = canvas.nodes.flatMap(node => {
        if (!node || typeof node.id !== "string" || !selected.has(node.id)) return [];
        return Object.entries(node.data?.outputs ?? {}).flatMap(([outputId, output]) => {
          const path = output?.value?.url;
          const kind = output?.dataType === "VIDEO" ? "video" : output?.dataType === "AUDIO" ? "audio" : output?.dataType === "IMAGE" ? "image" : undefined;
          return kind && typeof path === "string" && path.trim() ? [{ nodeId: node.id, outputId, path, label: node.data?.label || node.id, kind }] : [];
        });
      });
      if (sources.length > 500) throw new Error("单次最多导入 500 个画布素材");
      if (!sources.length && !(projectId && variantIds.length)) {
        if (!await saveProject()) throw new Error("原剪辑工程尚未保存，请先解决保存问题");
        if (!isCurrent()) return;
        sourceImportNotice.value = "所选画布节点没有可导入媒体，已保留当前剪辑工程内容。";
        clearSourceImportQuery();
        return;
      }
      for (const [index, source] of sources.entries()) {
        if (!isCurrent()) { await removeImportedAssets(canvasIncoming, currentDirectory); return; }
        sourceImportLabel.value = `正在冻结画布素材 ${index + 1}/${sources.length} · ${source.label}`;
        const { data } = await axios.post<{ data: { asset: EditorAsset } }>("/api/videoEditor/importMedia", { directory: currentDirectory, source: { type: "workspace", path: source.path, canvasPath, nodeId: source.nodeId, outputId: source.outputId } });
        canvasIncoming.push(data.data.asset);
        if (data.data.asset.kind !== source.kind) throw new Error(`画布输出「${source.label}」的素材类型已变化，请重新打开画布后再试`);
      }
    }

    if (variantIds.length && !projectId) throw new Error("缺少制作项目编号，请从项目重新选择候选");
    if (projectId && variantIds.length) {
      for (const [index, variantId] of variantIds.entries()) {
        if (!isCurrent()) { await removeImportedAssets([...canvasIncoming, ...productionIncoming], currentDirectory); return; }
        sourceImportLabel.value = `正在导入项目候选 ${index + 1}/${variantIds.length}`;
        const { data } = await axios.post<{ data: { asset: EditorAsset } }>("/api/productionProjects/cuts/importSource", { projectId, variantId, directory: currentDirectory });
        productionIncoming.push(data.data.asset);
        const source = data.data.asset.source;
        if (!source || source.type !== "production" || source.projectId?.toLowerCase() !== projectId.toLowerCase() || source.episodeId?.toLowerCase() !== productionEpisodeId.value?.toLowerCase()) throw new Error("候选素材不属于当前生产项目与剧集");
      }
    }
    if (!isCurrent()) { await removeImportedAssets([...canvasIncoming, ...productionIncoming], currentDirectory); return; }
    const unused = addImportedAssets([...canvasIncoming, ...productionIncoming], productionIncoming);
    applied = true;
    pendingSourceImportKey.value = key;
    pendingSourceImportAssets.value = [...canvasIncoming, ...productionIncoming];
    await removeImportedAssets(unused, currentDirectory);
    if (!await saveProject()) throw new Error("素材已加入当前编辑，但工程保存失败；请先解决保存问题后重试");
    if (!isCurrent()) return;
    pendingSourceImportKey.value = "";
    pendingSourceImportAssets.value = [];
    sourceImportNotice.value = projectId && variantIds.length
      ? `已按镜头顺序导入 ${variantIds.length} 个项目候选并追加到时间线。`
      : `已从画布冻结导入 ${canvasIncoming.length} 个媒体素材。`;
    clearSourceImportQuery();
  } catch (error) {
    if (!applied) await removeImportedAssets([...canvasIncoming, ...productionIncoming], currentDirectory);
    if (isCurrent()) {
      if (pendingSourceImportKey.value !== key) {
        sourceImportError.value = errorMessage(error, "导入素材失败");
      } else sourceImportError.value = errorMessage(error, "工程保存失败，素材已保留在当前编辑中，请重试保存");
    }
  } finally {
    if (version === projectVersion) sourceImportBusy.value = false;
  }
}
function addImportedAssets(incoming: EditorAsset[], timelineAssets: EditorAsset[] = []): EditorAsset[] {
  if (!incoming.length) return [];
  const next = getProject();
  const resolved: EditorAsset[] = [];
  const unused: EditorAsset[] = [];
  const initialAssetCount = next.assets.length;
  for (const asset of incoming) {
    const addToTimeline = timelineAssets.some(item => item.id === asset.id);
    const existing = next.assets.find(item => item.id === asset.id || item.path === asset.path || (asset.source && item.source
      && item.source.type === asset.source.type && item.source.path === asset.source.path && item.source.hash === asset.source.hash
      && item.source.variantId === asset.source.variantId && item.source.canvasPath === asset.source.canvasPath
      && item.source.nodeId === asset.source.nodeId && item.source.outputId === asset.source.outputId));
    if (existing) {
      if (existing.path !== asset.path) unused.push(asset);
      if (!addToTimeline || next.clips.some(clip => clip.assetId === existing.id)) continue;
      resolved.push(existing);
    } else { next.assets.push(asset); if (addToTimeline) resolved.push(asset); }
  }
  let lastClip: EditorClip | undefined;
  const hasChanges = next.assets.length !== initialAssetCount || resolved.length > 0;
  if (!hasChanges) return unused;
  if (resolved.length) {
    for (const asset of resolved) {
      const kind = asset.kind === "image" ? "video" : asset.kind;
      let track = next.tracks.find(item => item.kind === kind && !item.locked);
      if (!track) {
        track = { id: crypto.randomUUID(), kind, label: kind === "video" ? "视频" : "音频", locked: false, muted: false, hidden: false };
        next.tracks.push(track);
      }
      const start = Math.max(0, ...next.clips.filter(clip => clip.track === track.id).map(clip => clip.start + clipDuration(clip)));
      if (start + asset.duration > 86400) throw new Error("候选素材累计时长超过 24 小时，未能追加到时间线");
      lastClip = { id: crypto.randomUUID(), assetId: asset.id, title: asset.name, kind: asset.kind, track: track.id, start, inPoint: 0, outPoint: asset.duration, volume: 1 };
      next.clips.push(lastClip);
    }
  }
  const validated = parseEditorProject(next);
  saveHistory();
  applyProject(validated);
  selectedClipId.value = lastClip?.id;
  missingAssetIds.value = missingAssetIds.value.filter(id => !resolved.some(asset => asset.id === id));
  scheduleSave();
  if (lastClip) seekTo(lastClip.start);
  return unused;
}
async function importPickedMedia(source: { type: "workspace" | "library"; path: string }) {
  const currentDirectory = directory.value;
  if (!currentDirectory || !canEdit.value) return;
  const version = projectVersion;
  sourceImportBusy.value = true;
  sourceImportError.value = "";
  sourceImportNotice.value = "正在固定素材副本";
  retryPickedSource.value = source;
  let imported: EditorAsset | undefined;
  let applied = false;
  try {
    const { data } = await axios.post<{ data: { asset: EditorAsset } }>("/api/videoEditor/importMedia", { directory: currentDirectory, source });
    imported = data.data.asset;
    if (version !== projectVersion || currentDirectory !== directory.value) { await removeImportedAssets([imported], currentDirectory); return; }
    const unused = addImportedAssets([imported]);
    applied = true;
    pendingPickedAsset.value = imported;
    await removeImportedAssets(unused, currentDirectory);
    if (!await saveProject()) throw new Error("素材已固定，但工程保存失败，请解决保存问题后重试");
    pendingPickedAsset.value = undefined;
    retryPickedSource.value = undefined;
    mediaPickerOpen.value = false;
    sourceImportNotice.value = `已固定「${data.data.asset.name}」到当前剪辑工程。`;
  } catch (error) {
    if (imported && !applied) await removeImportedAssets([imported], currentDirectory);
    if (version === projectVersion) sourceImportError.value = errorMessage(error, "固定素材失败");
  } finally {
    if (version === projectVersion) sourceImportBusy.value = false;
  }
}
function sourceReferences() {
  return assets.value.filter(asset => clips.value.some(clip => clip.assetId === asset.id)).flatMap(asset => {
    const source = asset.source;
    if (!source) return [];
    const id = source.type === "production" ? source.variantId : source.hash;
    return id ? [{ type: source.type, id, label: asset.name }] : [];
  });
}
function invalidateExportIdentity() {
  exportRecordController?.abort();
  exportRecordVersion++;
  exportRecordSaved.value = false;
  lastExport.value = undefined;
  exportedProjectContent.value = "";
  renderSnapshots.clear();
  exportRecordError.value = "登录账户已更新，请重新打开剪辑台后恢复导出记录。";
}
function exportRequestCurrent(version: number, context: ProjectContext, session: ReturnType<typeof getSessionSnapshot>) {
  const current = getSessionSnapshot();
  return mounted && version === exportRecordVersion && projectContext === context && directory.value === context.directory && activeEditorProjectPath.value === context.projectPath && !sessionInvalidated.value && current.userId === session.userId;
}
function validateExportRecord(record: EditorExportRecord, context: ProjectContext, revision: string) {
  if (!record || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(record.id) || record.projectPath !== context.projectPath || record.revision !== revision || !/^assets\/videoEditor\/exports\/edited\d{13}[\da-f]{8}\.mp4$/.test(record.exportPath)) throw new Error("服务端返回的导出记录无效");
}
async function restoreLastExport(context: ProjectContext) {
  if (!/^[\da-f]{64}$/.test(context.revision) || !clips.value.length) return;
  exportRecordController?.abort();
  const controller = new AbortController();
  exportRecordController = controller;
  const version = ++exportRecordVersion;
  const session = getSessionSnapshot();
  const revision = context.revision;
  const content = getProjectContent();
  exportRecordBusy.value = true;
  try {
    const request = saveProject().then(saved => {
      if (!saved || !exportRequestCurrent(version, context, session) || context.revision !== revision || getProjectContent() !== content) return;
      return axios.get<ApiResponse<EditorExportRecord | null>>("/api/videoEditor/exports/latest", { params: { directory: context.directory, projectPath: context.projectPath, revision }, signal: controller.signal });
    });
    // ACT: 核验与现有保存队列串行，延迟完成的编辑也不能撞上自己的工程文件锁。
    saveQueue = request.then(() => true, () => true);
    const response = await request;
    if (!response) return;
    const { data } = response;
    if (!exportRequestCurrent(version, context, session) || context.revision !== revision || getProjectContent() !== content || exportBusy.value || !data.data) return;
    validateExportRecord(data.data, context, revision);
    lastExport.value = { id: data.data.id, directory: context.directory, url: useWorkspaceFiles(context.directory).mediaUrl(data.data.exportPath), name: data.data.exportPath.split("/").pop()!, path: data.data.exportPath, projectPath: context.projectPath, revision, sourceReferences: sourceReferences() };
    exportedProjectContent.value = content;
    exportRecordSaved.value = true;
    exportRecordError.value = "";
  } catch (error) {
    if (!controller.signal.aborted && exportRequestCurrent(version, context, session)) exportRecordError.value = `无法恢复上次导出记录：${errorMessage(error, "读取失败，请重新打开工程后重试")}`;
  } finally {
    if (exportRecordController === controller) {
      exportRecordController = undefined;
      exportRecordBusy.value = false;
    }
  }
}
async function persistLastExport() {
  const result = lastExport.value;
  const context = projectContext;
  if (!result || !context || context.directory !== result.directory || context.projectPath !== result.projectPath || context.revision !== result.revision || getProjectContent() !== exportedProjectContent.value || exportRecordBusy.value) return;
  exportRecordController?.abort();
  const controller = new AbortController();
  exportRecordController = controller;
  const version = ++exportRecordVersion;
  const session = getSessionSnapshot();
  exportRecordBusy.value = true;
  exportRecordError.value = "";
  try {
    const request = saveProject().then(saved => {
      if (!saved || !exportRequestCurrent(version, context, session) || context.revision !== result.revision || getProjectContent() !== exportedProjectContent.value) throw new Error("工程尚未保存或已变化，请重新导出后保存记录");
      return axios.post<ApiResponse<EditorExportRecord>>("/api/videoEditor/exports/record", { directory: result.directory, projectPath: result.projectPath, revision: result.revision, exportPath: result.path }, { signal: controller.signal });
    });
    saveQueue = request.then(() => true, () => true);
    const { data } = await request;
    if (!exportRequestCurrent(version, context, session) || lastExport.value !== result) return;
    validateExportRecord(data.data, context, result.revision);
    lastExport.value = { ...result, id: data.data.id };
    exportRecordSaved.value = true;
  } catch (error) {
    if (!controller.signal.aborted && exportRequestCurrent(version, context, session) && lastExport.value === result) exportRecordError.value = `MP4 已保留，但导出记录未保存；刷新后可能无法恢复登记入口。${errorMessage(error, "请重试保存导出记录")}`;
  } finally {
    if (exportRecordController === controller) {
      exportRecordController = undefined;
      exportRecordBusy.value = false;
    }
  }
}
function returnExportToCanvas() {
  const result = lastExport.value;
  const canvasPath = returnCanvasPath.value;
  if (!result || !canvasPath || !canRegisterExport.value || !directory.value) return;
  void router.push({ path: "/workspace", query: {
    editorResultId: result.id,
    editorResultDirectory: result.directory,
    editorCanvasPath: canvasPath,
    editorResultPath: result.path,
    editorProjectPath: result.projectPath,
  } });
}
function setEditorRenderResult(job: EditorRenderJob, restore: boolean) {
  const context = projectContext;
  if (!context || job.status !== "succeeded" || job.projectPath !== context.projectPath || job.revision !== context.revision || job.outputPath === "") return false;
  const snapshot = renderSnapshots.get(job.id);
  const content = getProjectContent();
  const savedContent = (() => {
    try { return JSON.stringify(parseEditorProject(JSON.parse(context.content))); }
    catch { return ""; }
  })();
  if (saveBusy.value || savePending.value || content !== (snapshot?.content ?? savedContent)) {
    if (restore) exportError.value = "成片对应的是旧版工程；当前工程已变化，无法用它登记审片或回写画布。";
    return false;
  }
  const files = useWorkspaceFiles(context.directory);
  const references = snapshot?.userId === getSessionSnapshot().userId ? snapshot.sourceReferences : sourceReferences();
  lastExport.value = { id: crypto.randomUUID(), directory: context.directory, url: files.mediaUrl(job.outputPath), name: job.outputPath.split("/").pop()!, path: job.outputPath, projectPath: job.projectPath, revision: job.revision, sourceReferences: references };
  exportedProjectContent.value = content;
  exportRecordSaved.value = false;
  exportRecordError.value = "";
  void persistLastExport();
  return true;
}
function completeEditorRender(job: EditorRenderJob) {
  setEditorRenderResult(job, false);
}
function openRenderQueue() {
  const dialog = renderQueueDialog.value;
  if (dialog && !dialog.open) dialog.showModal();
}
function useEditorRenderResult(job: EditorRenderJob) {
  if (setEditorRenderResult(job, true)) renderQueueDialog.value?.close();
}
async function exportTimeline() {
  const context = projectContext;
  if (!context || !canExport.value || exportBusy.value || exportRecordBusy.value) return;
  stopPlayback();
  exportRecordController?.abort();
  exportRecordVersion++;
  exportRecordSaved.value = false;
  exportRecordBusy.value = false;
  exportRecordError.value = "";
  exportError.value = "";
  exportBusy.value = true;
  exportSubmitting.value = false;
  exportProgress.value = undefined;
  const controller = new AbortController();
  exportController.value = controller;
  const version = projectVersion;
  const exportIdentityVersion = exportRecordVersion;
  const session = getSessionSnapshot();
  try {
    if (!await saveProject()) throw new Error("工程尚未保存成功，请解决保存问题后导出");
    const snapshot = parseEditorProject(getProject());
    exportedProjectContent.value = getProjectContent();
    const revision = context.revision;
    const projectContent = exportedProjectContent.value;
    const references = sourceReferences();
    const job = await exportEditorProject(snapshot, context.directory, controller.signal, progress => {
      if (version !== projectVersion) return;
      exportProgress.value = progress;
      exportSubmitting.value = progress >= 90;
    }, {
      projectPath: context.projectPath,
      revision,
      projectName: editorProjectName.value.trim(),
    });
    if (version !== projectVersion || exportIdentityVersion !== exportRecordVersion || sessionInvalidated.value || getSessionSnapshot().userId !== session.userId) return;
    renderSnapshots.set(job.id, { content: projectContent, sourceReferences: references, userId: session.userId });
    if (renderSnapshots.size > 50) renderSnapshots.delete(renderSnapshots.keys().next().value!);
    renderQueueRefreshKey.value++;
    openRenderQueue();
    exportError.value = "";
    exportBusy.value = false;
    exportSubmitting.value = false;
    exportController.value = undefined;
  } catch (error) {
    if (version === projectVersion) exportError.value = controller.signal.aborted ? "已取消导出，临时文件已清理。" : errorMessage(error, "导出失败");
  } finally {
    if (version === projectVersion) { exportBusy.value = false; exportSubmitting.value = false; exportController.value = undefined; renderQueueRefreshKey.value++; }
  }
}
</script>

<style lang="scss" scoped>
.videoEditor {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100dvh;
  min-width: 760px;
  min-height: 640px;
  overflow: auto;
  color: #e8ece7;
  background: #171a18;
  font-family: var(--uiFontFamily, sans-serif);
  font-size: 13px;

  *, *::before, *::after { box-sizing: border-box; }
  button {
    font: inherit;
    cursor: pointer;
    &:disabled { opacity: .4; cursor: not-allowed; }
    &:focus-visible { outline: 2px solid #90c9a2; outline-offset: 2px; }
  }
  :where(input:not([type="range"]):not([type="file"]):not([type="color"]), select, textarea) {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    padding: 6px 8px;
    border: 1px solid #3d453e;
    border-radius: 4px;
    outline: none;
    color: #e3e8e3;
    background: #181c19;
    font: inherit;
    font-size: 12px;
    &:focus { border-color: #6eaa87; box-shadow: 0 0 0 2px rgb(112 172 137 / 17%); }
    &:disabled { border-color: #343d36; color: #7d8980; background: #202621; cursor: not-allowed; }
    &::placeholder { color: #7b877e; }
  }
  input[type="range"] { min-width: 0; accent-color: #83bf97; }
  textarea { min-height: 76px; resize: vertical; line-height: 1.5; }
  .hiddenInput, .hiddenAudio { display: none; }
  .iconButton, .timelineButton, .transportButton, .tinyAction {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #bdc5be;
    background: transparent;
    &:hover:not(:disabled) { color: #fff; background: #343b35; }
  }
  .exportButton, .secondaryButton, .wideButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid #4f8c71;
    border-radius: 5px;
    color: #f5fbf6;
    background: #2b7253;
    font-weight: 600;
    &:hover:not(:disabled) { background: #33825f; }
  }
  .secondaryButton {
    border-color: #465149;
    color: #d0d8d1;
    background: #2a302b;
    &:hover:not(:disabled) { background: #353e37; }
  }
  .wideButton { width: 100%; margin-top: 4px; }
  .tinyAction { width: 27px; height: 27px; color: #aeb8b0; }
  .panelHeading {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 14px;
    > div { min-width: 0; }
    h2 { margin: 0; color: #e3e8e3; font-size: 14px; font-weight: 650; }
    span { display: block; overflow: hidden; margin-top: 4px; color: #8d978f; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  }
  .fieldLabel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
    color: #b8c3bb;
    font-size: 12px;
    line-height: 1.5;
    span { color: #89968d; font-size: 10px; }
    input[type="number"] { flex: 0 0 86px; width: 86px; min-height: 29px; padding: 4px 6px; font-variant-numeric: tabular-nums; font-size: 11px; }
  }
  .featureNote { margin: 4px 0 0; color: #929e95; font-size: 11px; line-height: 1.6; }
  .buttonRow {
    display: flex;
    align-items: center;
    gap: 8px;
    > * { flex: 1; min-width: 0; }
  }
  .exportError { margin-top: 15px; padding: 9px; border: 1px solid #724a3b; border-radius: 4px; color: #ffd0bb; background: #3d2923; font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }

  .editorHeader {
    display: flex;
    flex: 0 0 48px;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    height: 48px;
    padding: 0 12px;
    border-bottom: 1px solid #303631;
    background: #1d211e;
    .headerProject {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      .iconButton { width: 34px; height: 34px; }
      .backButton { border-color: #3b423c; background: #262b27; }
      .projectTitle {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        strong { font-size: 15px; font-weight: 650; }
        span { max-width: 300px; overflow: hidden; color: #969e97; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      }
    }
    .headerActions {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      > button { flex-shrink: 0; min-height: 30px; padding: 0 10px; font-size: 11px; }
      .projectPickerButton { max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .saveStatus { max-width: 300px; overflow: hidden; color: #8c968e; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; &.hasError { color: #f1a083; } }
    }
  }
  .noticeBar {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    min-height: 36px;
    padding: 6px 16px;
    margin-right: var(--agentWidth, 0px);
    border-bottom: 1px solid #64552e;
    color: #eadcae;
    background: #302b1d;
    font-size: 11px;
    line-height: 1.5;
    span { flex: 1 1 320px; }
    button { min-height: 26px; padding: 4px 8px; border: 1px solid #71623d; border-radius: 3px; color: #f4e5b2; background: #403922; &:hover { background: #51482b; } }
    &.errorNotice { border-color: #694536; color: #ffc7ab; background: #35251f; button { border-color: #785242; color: #ffd3bd; background: #482e25; &:hover { background: #593a2e; } } }
  }
  .editorWorkspace {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(280px, 1fr) 8px var(--timelineHeight, clamp(220px, 29dvh, 320px));
    min-width: 0;
    min-height: 508px;
    margin-right: var(--agentWidth, 0px);
    .editorBody {
      position: relative;
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr) 260px;
      min-height: 0;
      &.isUnavailable { pointer-events: none; opacity: .38; }
      .mediaPanel {
        display: grid;
        grid-template-columns: 56px minmax(0, 1fr);
        min-height: 0;
        overflow: hidden;
        border-right: 1px solid #343a35;
        background: #202421;
        .sideNav {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 4px;
          padding: 10px 5px;
          border-right: 1px solid #343a35;
          background: #1a1e1b;
          .sideTab {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 5px;
            width: 100%;
            min-height: 56px;
            border: 0;
            border-radius: 5px;
            color: #929b94;
            background: transparent;
            font-size: 10px;
            &:hover { color: #e5eee6; background: #292f2a; }
            &.isActive { color: #9ed6b5; background: #2c4034; }
          }
        }
        .assetPanel {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          padding: 15px 12px 11px;
          overflow-y: auto;
          &.textPanel, &.settingsPanel { gap: 10px; }
          .importActions { display: grid; flex: 0 0 auto; gap: 6px; }
          .importButton {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            justify-content: center;
            gap: 7px;
            width: 100%;
            min-height: 33px;
            padding: 6px 8px;
            border: 1px solid #527a60;
            border-radius: 4px;
            color: #d9eddf;
            background: #294232;
            font-size: 11px;
            &:hover:not(:disabled) { border-color: #75a483; background: #34523d; }
          }
          .assetHint {
            display: flex;
            flex: 0 0 auto;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            padding: 8px 0;
            color: #a7b4aa;
            font-size: 11px;
            overflow-wrap: anywhere;
            button { padding: 3px 7px; border: 1px solid #536759; border-radius: 3px; color: #d0e2d5; background: #2b3b30; }
          }
          .assetSearch { flex: 0 0 auto; margin-top: 9px; font-size: 11px; }
          .assetFilters {
            display: flex;
            flex: 0 0 auto;
            gap: 3px;
            margin: 8px 0;
            button { flex: 1; min-width: 0; padding: 5px 2px; border: 1px solid transparent; border-radius: 3px; color: #a0aca3; background: #191d1a; font-size: 10px; &:hover { color: #dce9e0; } &.isActive { border-color: #45624d; color: #c4dfcb; background: #2b3a2e; } }
          }
          .assetList {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            gap: 3px;
            min-height: 0;
            overflow-y: auto;
            .assetRow {
              display: grid;
              grid-template-columns: 30px repeat(3, minmax(0, 1fr));
              flex: 0 0 auto;
              align-items: center;
              gap: 6px;
              min-width: 0;
              padding: 7px 5px;
              border: 1px solid transparent;
              border-radius: 4px;
              background: #272c28;
              cursor: grab;
              &:hover { background: #303732; }
              &.isMissing { border-color: #815743; background: #33271f; }
              &.isSelected { border-color: #64846c; background: #2d3b31; box-shadow: inset 2px 0 #8ec29c; }
              .assetIcon { display: flex; grid-row: 1 / span 2; align-items: center; justify-content: center; width: 30px; height: 34px; border-radius: 4px; color: #9dd9b6; background: #284234; &.audio { color: #e7c681; background: #4a4028; } &.image { color: #b8d2ef; background: #2d3d4d; } }
              .assetInfo { display: flex; grid-column: 2 / -1; flex-direction: column; gap: 4px; min-width: 0; strong { overflow: hidden; color: #dce3dc; font-size: 11px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; } span { color: #8b958d; font-size: 10px; white-space: nowrap; } }
              .tinyAction { grid-row: 2; width: 100%; height: 23px; &:nth-of-type(1) { grid-column: 2; } &:nth-of-type(2) { grid-column: 3; } &:nth-of-type(3) { grid-column: 4; } }
              .cacheControls { display: flex; grid-column: 2 / -1; grid-row: 3; align-items: center; gap: 6px; min-width: 0; .cacheState { flex: 1; min-width: 0; overflow: hidden; color: #8fa496; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; &.hasError { color: #e6a38f; } } .cacheButton { flex: 0 0 auto; min-height: 21px; padding: 2px 5px; border: 1px solid #465a4b; border-radius: 3px; color: #c1d9c7; background: #26372b; font-size: 9px; &:hover:not(:disabled) { border-color: #6a9075; background: #304536; } &:disabled { opacity: .55; cursor: not-allowed; } } .cancelCacheButton { border-color: #6c5547; color: #e2b39c; background: #352921; } }
            }
          }
          .dropHint { flex: 0 0 auto; margin-top: 10px; padding: 9px 5px; border: 1px dashed #485249; border-radius: 4px; color: #929b94; background: transparent; text-align: center; font-size: 10px; line-height: 1.5; &:hover:not(:disabled) { border-color: #77ae8e; color: #c7dbcc; } }
        }
      }
      .previewArea {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        min-height: 0;
        padding: 0;
        background: #151816;
        overflow: hidden;
        .monitorHeader { display: flex; flex: 0 0 36px; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 0 8px; border-bottom: 1px solid #303631;
          .previewTitle { margin-right: auto; color: #aeb7af; font-size: 11px; white-space: nowrap; }
          .monitorModes { display: flex; align-items: center; gap: 2px;
            button { min-height: 24px; padding: 0 7px; border: 1px solid transparent; border-radius: 3px; color: #82968a; background: transparent; font-size: 10px; white-space: nowrap; &.isActive { border-color: #415d49; color: #c7e7d0; background: #263d2e; } }
          }
          .monitorAction { flex: 0 0 auto; min-height: 24px; padding: 0 7px; border: 1px solid #415247; border-radius: 3px; color: #c0d0c5; background: #242e27; font-size: 10px; &:disabled { opacity: .45; cursor: not-allowed; } }
          .agentToggle { display: inline-flex; align-items: center; justify-content: center; width: 28px; padding: 0; }
          .inspectorToggle { display: none; }
        }
        .monitorGrid { display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; gap: 8px; width: 100%; min-width: 0; min-height: 0;
          &.isDual { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .sourceMonitorPanel { order: -1; min-height: 0; height: 100%; }
          .programMonitor { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0;
            .previewHost {
              display: flex;
              flex: 1 1 0;
              align-items: center;
              justify-content: center;
              width: 100%;
              min-height: 0;
              margin: 0;
              padding: 8px;
              overflow: hidden;
              .previewStage {
                position: relative;
                flex: 0 0 auto;
                min-width: 0;
                min-height: 0;
                max-width: 100%;
                max-height: 100%;
                margin: 0;
                overflow: hidden;
                container-type: size;
                border: 1px solid #303631;
                background: #080a09;
                box-shadow: 0 10px 35px rgb(0 0 0 / 22%);
                .previewVideo { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: contain; }
                .previewText { position: absolute; right: auto; bottom: auto; width: max-content; max-width: 92%; color: #fff; font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; font-size: 4cqw; font-weight: 600; line-height: 1.2; text-align: center; text-shadow: 0 2px 5px rgb(0 0 0 / 85%); white-space: pre-wrap; overflow-wrap: anywhere; transform: translate(-50%, -50%); pointer-events: none; }
                .previewEmpty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #727c74; font-size: 12px; pointer-events: none; }
              }
            }
            .previewAlert { position: absolute; right: 18px; bottom: 58px; z-index: 3; display: flex; align-items: center; gap: 8px; max-width: 80%; padding: 8px 10px; border: 1px solid #824d3d; border-radius: 4px; color: #ffd0bc; background: #442920; font-size: 11px; line-height: 1.5; button { flex: 0 0 auto; border: 0; color: inherit; background: transparent; } }
            .transportBar {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto minmax(56px, 1fr);
              flex: 0 0 44px;
              align-items: center;
              gap: 8px;
              width: 100%;
              height: 44px;
              padding: 0 8px;
              border-top: 1px solid #303631;
              background: #202421;
              .transportButtons { display: flex; align-items: center; }
              .transportButton { width: 27px; height: 30px; color: #b9c5bc; }
              .transportTime { min-width: 0; color: #aeb7af; font-variant-numeric: tabular-nums; font-size: 10px; white-space: nowrap; }
              .previewRatio { justify-self: end; width: 56px; min-height: 25px; padding: 2px; font-size: 10px; }
            }
          }
        }
      }
      .inspectorPanel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 16px 13px;
        overflow-y: auto;
        border-left: 1px solid #343a35;
        background: #202421;
        .panelHeading { margin-bottom: 16px; }
        .inspectorClose { display: none; }
        fieldset {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
          margin: 0;
          padding: 0;
          border: 0;
          &:disabled { opacity: .62; .fieldLabel { color: #8b988f; } input, select, textarea, button { cursor: not-allowed; } }
        }
        input[type="number"] { font-variant-numeric: tabular-nums; }
        input[type="range"] { width: 100%; margin: 7px 0; }
        input[type="color"] { width: 100%; min-height: 32px; padding: 3px; border: 1px solid #3d453e; border-radius: 4px; background: #181c19; }
        details { margin-top: 12px; padding: 9px 0; border-top: 1px solid #343a35; border-bottom: 1px solid #343a35; summary { color: #c0cbc2; font-size: 12px; cursor: pointer; &:focus-visible { outline: 1px solid #90c9a2; outline-offset: 3px; } } }
        .keyframePanel {
          .buttonRow { margin-top: 9px; gap: 5px; .secondaryButton { min-height: 29px; padding: 0 6px; font-size: 10px; } }
          .keyframeNavigation { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; color: #9cac9f; font-size: 10px; button { display: grid; place-items: center; width: 28px; height: 25px; padding: 0; border: 1px solid #3b493f; border-radius: 3px; color: #b9d7c2; background: #29382e; } }
          .keyframeList { display: flex; flex-direction: column; gap: 3px; max-height: 132px; margin-top: 6px; overflow-y: auto;
            .keyframeRow { display: flex; gap: 3px;
              .keyframeJump { display: flex; flex: 1; align-items: center; justify-content: space-between; min-height: 27px; padding: 3px 6px; border: 1px solid #39443c; border-radius: 3px; color: #b7c7bc; background: #202b23; font-size: 10px; font-variant-numeric: tabular-nums; span { color: #d0e4d5; } }
              .keyframeRemove { width: 26px; padding: 0; border: 1px solid #51413b; border-radius: 3px; color: #c8aaa0; background: #2e2723; }
            }
          }
        }
        .precisionPanel { .buttonRow { margin-top: 8px; gap: 4px; .secondaryButton { min-height: 27px; padding: 0 5px; font-size: 10px; } } .featureNote { margin-top: 7px; } }
        .inspectorFooter { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 17px; padding-top: 12px; border-top: 1px solid #343a35; color: #929c94; font-size: 11px; strong { color: #dce4dc; font-variant-numeric: tabular-nums; } }
        .removeButton { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 33px; margin-top: 12px; border: 1px solid #65473f; border-radius: 4px; color: #e5a18d; background: #30231f; &:hover:not(:disabled) { background: #422b25; } }
        .inspectorEmpty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 120px; color: #7a857d; text-align: center; font-size: 11px; }
      }
    }
    .timelineSeparator { display: grid; place-items: center; cursor: ns-resize; touch-action: none; background: #171a18;
      &::after { width: 36px; height: 3px; border-radius: 2px; background: #526057; content: ""; }
      &:hover::after, &:focus-visible::after { background: #90c9a2; }
      &:focus-visible { outline: 2px solid #90c9a2; outline-offset: -2px; }
    }
    .timelinePanel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border-top: 1px solid #3a413b;
      background: #1d211e;
      &.isCompact {
        .timelineViewport .timelineCanvas .timelineTrack { height: 52px;
          .trackLabel { height: 51px; gap: 2px; padding: 2px 6px; }
          .trackContent .timelineClip { top: 5px;
            &.video, &.image { top: 3px; height: 46px; }
          }
        }
      }
      .editNotice { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 12px; border-bottom: 1px solid #644d36; color: #edc5a7; background: #352a20; font-size: 11px; button { border: 0; color: inherit; background: transparent; } }
      .trackAdd { min-height: 27px; padding: 0 7px; border: 1px solid #3c483e; border-radius: 3px; color: #aab8ad; background: #252b26; font-size: 10px; &:hover:not(:disabled) { border-color: #64846c; color: #deece0; } }
      .timelineHeader {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 46px;
        padding: 6px 12px;
        border-bottom: 1px solid #323832;
        .timelineActions { display: flex; align-items: center; gap: 4px; min-width: 0; overflow-x: auto; scrollbar-width: thin; > * { flex-shrink: 0; } }
        .editMode { width: auto; min-height: 27px; padding: 3px 5px; color: #b7cebd; font-size: 10px; }
        .timelineButton { width: 30px; height: 30px; color: #a8b2aa; &.isActive { border-color: #506958; color: #a8ddb9; background: #2b4033; } &:hover:not(:disabled) { border-color: #424b43; } }
        .snapButton { gap: 5px; width: auto; padding: 0 7px; font-size: 10px; }
        .headerDivider { width: 1px; height: 20px; margin: 0 5px; background: #394039; }
        .timelineZoom { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; color: #8e988f; font-size: 10px; label { display: inline-flex; align-items: center; gap: 5px; } input { width: 90px; accent-color: #78b78f; } }
      }
      .timelineViewport {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow: auto;
        .timelineCanvas {
          position: relative;
          min-height: 100%;
          padding-left: 174px;
          .rulerLabel, .trackLabel { position: absolute; top: 0; left: -174px; width: 174px; border-right: 1px solid #3b433c; color: #aab4ac; background: #222723; font-size: 10px; }
          .timelineRuler {
            position: sticky;
            top: 0;
            z-index: 3;
            display: flex;
            height: 28px;
            border-bottom: 1px solid #414841;
            background: #242925;
            cursor: pointer;
            .rulerLabel { z-index: 4; display: flex; align-items: center; height: 27px; padding-left: 12px; }
            .rulerTicks { position: relative; flex: 1; height: 100%; .rulerTick { position: absolute; top: 0; height: 100%; padding: 5px 0 0 5px; border-left: 1px solid #394039; color: #7f8981; font-size: 9px; font-variant-numeric: tabular-nums; pointer-events: none; } }
          }
          .timelineTrack {
            position: relative;
            height: 76px;
            border-bottom: 1px solid #343a35;
            background: #1b1f1c;
            &.audio { background: #1d211d; }
            &.text { background: #1b1f1d; }
            &.isLocked .trackContent { opacity: .55; }
            &.isHidden .timelineClip { opacity: .48; }
            .trackLabel {
              z-index: 2;
              display: flex;
              flex-direction: column;
              align-items: stretch;
              justify-content: center;
              gap: 5px;
              height: 75px;
              padding: 6px;
              .trackName { display: flex; align-items: center; gap: 5px; min-width: 0; input { flex: 1; width: 0; min-height: 23px; padding: 2px 3px; border-color: transparent; border-radius: 2px; color: #bdc8bf; background: transparent; font-size: 10px; &:focus { border-color: #59695b; box-shadow: none; } &:disabled { color: #8b988f; opacity: .75; } } small { flex: 0 0 auto; min-width: 17px; color: #829087; text-align: right; font-size: 9px; } }
              .trackControls { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; button { min-width: 22px; min-height: 22px; padding: 2px 4px; border: 1px solid #3b443d; border-radius: 2px; color: #a3afa6; background: #262b27; font-size: 9px; &:hover:not(:disabled) { color: #e6efe8; background: #354137; } &[aria-pressed="true"] { border-color: #74523d; color: #e4ae8c; background: #37291f; } } }
            }
            .trackContent {
              position: relative;
              height: 100%;
              .timelineClip {
                position: absolute;
                top: 16px;
                display: flex;
                align-items: center;
                gap: 6px;
                height: 42px;
                min-width: 2px;
                padding: 0 9px;
                overflow: hidden;
                border: 1px solid #52745d;
                border-radius: 4px;
                color: #e6f1e8;
                background: #31513b;
                text-align: left;
                cursor: grab;
                touch-action: none;
                &:hover { filter: brightness(1.12); }
                &.isSelected { z-index: 2; border-color: #a3d5b0; box-shadow: 0 0 0 1px #a3d5b0; }
                &.audio { border-color: #8a7443; color: #f3e4bb; background: #554a2d; }
                &.text { border-color: #6c618a; color: #e1d8f4; background: #423950; }
                &.video, &.image { top: 8px; height: 59px; align-items: flex-start; padding-top: 2px; background: #263b2e; .clipTitle, .clipDuration { position: relative; z-index: 1; line-height: 15px; } }
                .clipTitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
                .clipDuration { flex: 0 0 auto; color: rgb(255 255 255 / 68%); font-size: 9px; font-variant-numeric: tabular-nums; }
                &.audio { .clipTitle, .clipDuration { position: relative; z-index: 1; } }
                .trimHandle { position: absolute; top: 0; z-index: 1; width: 6px; height: 100%; background: rgb(255 255 255 / 22%); cursor: ew-resize; &.leftHandle { left: 0; } &.rightHandle { right: 0; } }
              }
            }
          }
          .playhead { position: absolute; top: 0; bottom: 0; left: 174px; z-index: 5; width: 1px; background: #f08d62; pointer-events: none; .playheadCap { position: absolute; top: 0; left: -5px; width: 11px; height: 10px; border-radius: 3px 3px 1px 1px; background: #f08d62; pointer-events: auto; cursor: ew-resize; } .playheadLine { position: absolute; top: 10px; bottom: 0; left: 0; border-left: 1px solid #f08d62; } }
        }
      }
      .timelineFooter { display: flex; flex: 0 0 26px; align-items: center; justify-content: space-between; gap: 12px; min-height: 26px; padding: 0 12px; color: #8d978f; font-size: 9px; > span { flex: 0 0 auto; } .timelineFooterNote { flex: 1; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; } }
    }
  }
  &.isExpanded .editorWorkspace .editorBody {
    grid-template-columns: minmax(0, 1fr);
    .mediaPanel, .inspectorPanel, .previewArea .monitorHeader .inspectorToggle { display: none; }
  }
  .deliveryDialog { width: min(620px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 18px; overflow-y: auto; border: 1px solid #465148; border-radius: 7px; color: #d8e0d9; background: #1c231e; box-shadow: 0 18px 70px rgb(0 0 0 / 42%);
    &::backdrop { background: rgb(5 7 6 / 72%); }
    .deliveryHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; strong { font-size: 15px; } }
    .exportStale { margin: 10px 0 0; color: #d2aa7c; font-size: 11px; }
  }
  .noProject { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #a5b1a7; h1 { margin: 8px 0 0; color: #e0e6e0; font-size: 19px; } }
  .renderQueueDialog { width: min(720px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 18px; overflow-y: auto; border: 1px solid #465148; border-radius: 7px; color: #d8e0d9; background: #1c231e; box-shadow: 0 18px 70px rgb(0 0 0 / 42%);
    &::backdrop { background: rgb(5 7 6 / 72%); }
    .renderDialogHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; strong { font-size: 15px; } }
  }
  .exportOverlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgb(5 7 6 / 72%);
    .recoveryDialog { display: flex; flex-direction: column; gap: 10px; width: min(460px, 100%); max-height: calc(100dvh - 32px); padding: 22px; overflow-y: auto; border: 1px solid #465148; border-radius: 5px; color: #d8e0d9; background: #222723; box-shadow: 0 18px 70px rgb(0 0 0 / 42%); h2 { margin: 0; font-size: 16px; } p { margin: 0; color: #a6b2a9; font-size: 12px; line-height: 1.6; } > span { color: #95a399; font-size: 11px; } select { min-height: 34px; } .buttonRow { margin-top: 6px; } .exportError { color: #ffd0bb; } }
    .editorProjectsDialog {
      width: min(560px, 100%);
      padding: 24px;
      border-color: #536158;
      border-radius: 8px;
      background: #222b25;
      h2 { color: #f2f6f3; font-size: 18px; line-height: 1.4; }
      > p { color: #becbc2; line-height: 1.7; }
      > .fieldLabel { margin-top: 12px; color: #e0e9e3; font-weight: 600; }
      .projectCreateRow {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        input { min-height: 38px; padding: 8px 11px; border-color: #617168; color: #f2f6f3; background: #171e19; &::placeholder { color: #a5b5ab; } }
        .exportButton { min-width: 76px; min-height: 38px; &:disabled { opacity: 1; border-color: #45584c; color: #a9b9af; background: #30463a; } }
      }
      .editorProjectList {
        display: grid;
        gap: 8px;
        min-height: 0;
        max-height: min(360px, 44dvh);
        margin-top: 8px;
        padding: 3px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #71877a #19221c;
        .editorProjectChoice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          width: 100%;
          min-width: 0;
          min-height: 68px;
          padding: 12px;
          border: 1px solid #526158;
          border-radius: 6px;
          text-align: left;
          color: #edf3ef;
          background: #29352d;
          &:hover:not(:disabled) { border-color: #95b6a2; background: #33463a; }
          &:disabled { opacity: .7; }
          .projectChoiceInfo {
            display: grid;
            gap: 5px;
            min-width: 0;
            strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            strong { font-size: 14px; font-weight: 600; line-height: 1.4; }
            small { color: #b7c8be; font-size: 11px; font-weight: 400; line-height: 1.5; }
          }
          .projectChoiceState { flex: 0 0 auto; padding: 5px 9px; border: 1px solid #63786b; border-radius: 4px; color: #d6e7dd; background: #34483b; font-size: 12px; line-height: 1.4; }
          &.isCurrent {
            opacity: 1;
            border-color: #86b398;
            background: #304c3c;
            cursor: default;
            .projectChoiceState { border-color: #8eb39b; color: #effbf3; background: #3e664e; }
          }
        }
      }
      > .buttonRow { margin-top: 10px; .secondaryButton { min-height: 38px; color: #e7efe9; border-color: #617168; background: #303d34; &:hover:not(:disabled) { background: #3e5044; } } }
    }
    .exportDialog {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      width: min(340px, 100%);
      padding: 26px 24px 20px;
      border: 1px solid #414940;
      border-radius: 7px;
      background: #222723;
      box-shadow: 0 18px 70px rgb(0 0 0 / 42%);
      strong { color: #e5ece6; font-size: 14px; }
      span { min-height: 16px; color: #9daa9e; font-variant-numeric: tabular-nums; font-size: 11px; }
      .secondaryButton { margin-top: 3px; }
      .exportSpinner { width: 30px; height: 30px; border: 3px solid #46534a; border-top-color: #8bc59d; border-radius: 50%; animation: spin 1s linear infinite; }
      .progressTrack { width: 100%; height: 5px; overflow: hidden; border-radius: 3px; background: #3a413b; i { display: block; height: 100%; border-radius: inherit; background: #79b78f; transition: width .2s ease; } }
    }
  }
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) {
  .videoEditor {
    .editorHeader { gap: 8px;
      .headerProject .projectTitle span { max-width: 120px; }
      .headerActions { gap: 6px;
        > button { min-height: 28px; padding: 0 7px; font-size: 10px; white-space: nowrap; }
        .projectPickerButton { max-width: 160px; }
        .saveStatus { max-width: 100px; }
      }
    }
    .editorWorkspace .editorBody { grid-template-columns: 240px minmax(0, 1fr);
      .inspectorPanel { display: none; }
      .previewArea .monitorHeader .inspectorToggle { display: inline-flex; align-items: center; }
    }
    &.inspectorOpen .editorWorkspace .editorBody .inspectorPanel { position: absolute; inset: 0 0 0 auto; z-index: 8; display: flex; width: 260px; box-shadow: -10px 0 30px rgb(0 0 0 / 25%); .inspectorClose { display: inline-flex; } }
  }
}
</style>
