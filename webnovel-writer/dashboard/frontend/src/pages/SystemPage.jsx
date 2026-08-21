import { useEffect, useMemo, useState } from 'react'
import { useDashboardContext } from '../App.jsx'
import Badge from '../components/Badge.jsx'
import DataTable from '../components/DataTable.jsx'
import {
    fetchCommits,
    fetchContractsSummary,
    fetchEnvStatus,
    fetchModelGatewayModels,
    fetchStoryRuntimeHealth,
    probeEnvStatus,
    saveModelGatewaySettings,
} from '../api.js'
import { formatChapterLabel, formatDateTime, formatNumber } from '../lib/format.js'

function statusTone(status) {
    const text = String(status || '').toLowerCase()
    if (text === 'accepted' || text === 'done' || text === 'ok' || text === 'full') return 'green'
    if (text === 'rejected' || text === 'failed' || text === 'error') return 'red'
    if (text === 'skipped' || text === 'missing' || text === 'bm25_only') return 'amber'
    return 'blue'
}

function projectionSummary(projectionStatus) {
    const values = Object.values(projectionStatus || {})
    if (!values.length) return '无投影'
    if (values.every(value => value === 'done')) return '5 路 projection OK'
    return values.join(' / ')
}

function modelTypeLabel(type) {
    if (type === 'image') return '图像'
    if (type === 'video') return '视频'
    return '文本'
}

function StatCard({ label, value, sub, tone = 'plain' }) {
    return (
        <article className="card stat-card">
            <span className="stat-label">{label}</span>
            <span className={`stat-value ${tone === 'plain' ? 'plain' : ''}`.trim()}>{value}</span>
            <span className="stat-sub">{sub}</span>
        </article>
    )
}

export default function SystemPage() {
    const { auth, setAuth, refreshToken } = useDashboardContext()
    const gateway = auth?.user?.model_gateway || {}
    const [runtimeHealth, setRuntimeHealth] = useState(null)
    const [contractsSummary, setContractsSummary] = useState(null)
    const [commits, setCommits] = useState([])
    const [envStatus, setEnvStatus] = useState(null)
    const [probeResult, setProbeResult] = useState(null)
    const [probing, setProbing] = useState(false)
    const [models, setModels] = useState([])
    const [selectedModel, setSelectedModel] = useState(gateway.default_model || '')
    const [customModel, setCustomModel] = useState('')
    const [modelRefreshToken, setModelRefreshToken] = useState(0)
    const [loadingModels, setLoadingModels] = useState(false)
    const [savingModel, setSavingModel] = useState(false)
    const [modelError, setModelError] = useState('')
    const [modelSavedAt, setModelSavedAt] = useState('')

    const configured = Boolean(gateway.configured)
    const defaultModel = gateway.default_model || ''
    const accountLabel = gateway.account_label || ''

    useEffect(() => {
        setSelectedModel(defaultModel)
    }, [defaultModel])

    useEffect(() => {
        let cancelled = false

        Promise.allSettled([
            fetchStoryRuntimeHealth(),
            fetchContractsSummary(),
            fetchCommits({ limit: 12 }),
            fetchEnvStatus(),
        ]).then(results => {
            if (cancelled) return

            setRuntimeHealth(results[0].status === 'fulfilled' ? results[0].value : null)
            setContractsSummary(results[1].status === 'fulfilled' ? results[1].value : null)
            setCommits(results[2].status === 'fulfilled' ? (results[2].value.items || []) : [])
            setEnvStatus(results[3].status === 'fulfilled' ? results[3].value : null)
        })

        return () => {
            cancelled = true
        }
    }, [refreshToken])

    useEffect(() => {
        if (!configured) {
            setModels([])
            return undefined
        }

        let cancelled = false
        setLoadingModels(true)
        setModelError('')
        fetchModelGatewayModels()
            .then(payload => {
                if (cancelled) return
                const nextModels = payload.models || []
                setModels(nextModels)
                setSelectedModel(current => (
                    current
                    || payload.default_model
                    || defaultModel
                    || nextModels.find(item => item.type === 'text')?.id
                    || nextModels[0]?.id
                    || ''
                ))
            })
            .catch(err => {
                if (!cancelled) setModelError(err.message || '模型列表读取失败')
            })
            .finally(() => {
                if (!cancelled) setLoadingModels(false)
            })

        return () => {
            cancelled = true
        }
    }, [configured, defaultModel, modelRefreshToken, refreshToken])

    const latestCommit = commits[0] || null
    const setupRows = useMemo(() => {
        const hasMaster = Boolean(contractsSummary?.master?.exists)
        const hasCommit = Boolean(latestCommit || runtimeHealth?.latest_commit_status === 'accepted')
        const vectorReady = Boolean(envStatus?.vector_db?.exists && !envStatus?.vector_db?.error)
        const embedReady = Boolean(envStatus?.embed?.api_key_present)
        const rerankReady = Boolean(envStatus?.rerank?.api_key_present)

        return [
            {
                name: '模型路由',
                ok: configured && Boolean(defaultModel || selectedModel),
                detail: configured
                    ? `默认模型：${defaultModel || selectedModel || '未选择'}`
                    : '需要先登录模型账号或配置模型访问密钥',
                action: '影响创作台生成调用',
                required: true,
            },
            {
                name: '故事主档',
                ok: hasMaster,
                detail: hasMaster ? '主合同已存在' : '新项目尚未完成主设定初始化',
                action: '开始正式连载前需要补齐',
                required: true,
            },
            {
                name: '章节入账',
                ok: hasCommit,
                detail: hasCommit ? '已有章节 commit' : '还没有完成任何章节 commit',
                action: '写完第一章并通过提交后会恢复 Mainline',
                required: false,
            },
            {
                name: '语义检索',
                ok: embedReady && vectorReady,
                detail: envStatus?.rag_mode === 'full'
                    ? '向量检索已启用'
                    : '当前会退回 BM25 关键词检索',
                action: '不阻塞生成，但长篇回忆能力会弱一些',
                required: false,
            },
            {
                name: '重排检索',
                ok: rerankReady,
                detail: rerankReady ? 'rerank 已配置' : '未配置 rerank key',
                action: '可选增强，不影响基础写作',
                required: false,
            },
        ]
    }, [configured, contractsSummary, defaultModel, envStatus, latestCommit, runtimeHealth, selectedModel])

    const modelOptions = useMemo(() => {
        if (selectedModel && !models.some(item => item.id === selectedModel)) {
            return [{ id: selectedModel, type: 'text' }, ...models]
        }
        return models
    }, [models, selectedModel])

    const modelStats = useMemo(() => (
        models.reduce(
            (stats, item) => {
                const type = item.type === 'image' || item.type === 'video' ? item.type : 'text'
                return { ...stats, [type]: stats[type] + 1 }
            },
            { text: 0, image: 0, video: 0 },
        )
    ), [models])

    const contractRows = useMemo(() => {
        if (!contractsSummary) return []
        return [
            {
                type: 'MASTER_SETTING',
                count: contractsSummary.master?.exists ? 1 : 0,
                desc: [contractsSummary.master?.primary_genre, contractsSummary.master?.core_tone].filter(Boolean).join(' · ') || '未检测到主合同',
            },
            {
                type: 'VOLUME_BRIEF',
                count: contractsSummary.counts?.volumes || 0,
                desc: `当前卷 ${contractsSummary.current_volume || '—'} · ${contractsSummary.current_contracts?.volume ? '存在' : '缺失'}`,
            },
            {
                type: 'CHAPTER_BRIEF',
                count: contractsSummary.counts?.chapters || 0,
                desc: `${formatChapterLabel(contractsSummary.chapter)} · ${contractsSummary.current_contracts?.chapter ? '存在' : '缺失'}`,
            },
            {
                type: 'REVIEW_CONTRACT',
                count: contractsSummary.counts?.reviews || 0,
                desc: `${contractsSummary.current_contracts?.review ? '当前章已生成审查合同' : '当前章缺少审查合同'}`,
            },
            {
                type: 'COMMIT',
                count: contractsSummary.counts?.commits || 0,
                desc: `${contractsSummary.current_contracts?.commit ? '当前章已有 commit' : '当前章无 commit'}`,
            },
        ]
    }, [contractsSummary])

    const envRows = useMemo(() => {
        if (probeResult?.checks?.length) {
            return probeResult.checks.map(item => ({
                name: item.name,
                ok: item.ok,
                detail: item.detail,
            }))
        }
        if (!envStatus) return []

        return [
            {
                name: 'embed',
                ok: envStatus.embed?.api_key_present,
                detail: `${envStatus.embed?.model || 'unknown'} · ${envStatus.embed?.base_url || 'no base url'}`,
            },
            {
                name: 'rerank',
                ok: envStatus.rerank?.api_key_present,
                detail: `${envStatus.rerank?.model || 'unknown'} · ${envStatus.rerank?.base_url || 'no base url'}`,
            },
            {
                name: 'vector_db',
                ok: envStatus.vector_db?.exists && !envStatus.vector_db?.error,
                detail: `${envStatus.vector_db?.record_count || 0} records · ${envStatus.vector_db?.size_bytes || 0} bytes`,
            },
            {
                name: 'rag_mode',
                ok: Boolean(envStatus.rag_mode),
                detail: envStatus.rag_mode,
            },
        ]
    }, [envStatus, probeResult])

    async function saveModelSettings(event) {
        event.preventDefault()
        const nextModel = customModel.trim() || selectedModel.trim()
        if (!nextModel) {
            setModelError('请选择或填写模型 ID')
            return
        }

        setSavingModel(true)
        setModelError('')
        setModelSavedAt('')
        try {
            const payload = await saveModelGatewaySettings({ defaultModel: nextModel })
            setAuth(current => ({ ...current, user: payload.user }))
            setSelectedModel(payload.user?.model_gateway?.default_model || nextModel)
            setCustomModel('')
            setModelSavedAt(new Date().toISOString())
        } catch (err) {
            setModelError(err.message || '保存模型失败')
        } finally {
            setSavingModel(false)
        }
    }

    return (
        <section className="dashboard-page">
            <header className="page-header">
                <h2>系统状态</h2>
            </header>

            <div className="stat-grid">
                <StatCard
                    label="Story Runtime"
                    value={runtimeHealth?.mainline_ready ? 'Mainline' : 'Fallback'}
                    sub={`fallback: ${(runtimeHealth?.fallback_sources || []).join(', ') || 'none'}`}
                />
                <StatCard
                    label="Latest Commit"
                    value={latestCommit?.status || runtimeHealth?.latest_commit_status || 'missing'}
                    sub={latestCommit ? `${formatChapterLabel(latestCommit.chapter)} · ${projectionSummary(latestCommit.projection_status)}` : '暂无 commit 数据'}
                />
                <StatCard
                    label="RAG Mode"
                    value={envStatus?.rag_mode || 'unknown'}
                    sub={`${envStatus?.embed?.api_key_present ? 'embed ready' : 'embed missing'} · ${envStatus?.rerank?.api_key_present ? 'rerank ready' : 'rerank missing'}`}
                />
                <StatCard
                    label="Vector DB"
                    value={formatNumber(envStatus?.vector_db?.record_count || 0)}
                    sub={`${envStatus?.vector_db?.size_bytes || 0} bytes`}
                />
                <StatCard
                    label="Model Router"
                    value={configured ? 'Ready' : 'Missing'}
                    sub={defaultModel || selectedModel || '未选择默认模型'}
                />
            </div>

            <article className="card">
                <div className="card-header">
                    <div>
                        <div className="section-label">MODEL ROUTER</div>
                        <div className="card-title">智能路由模型</div>
                    </div>
                    <div className="model-router-actions">
                        <Badge tone={configured ? 'green' : 'amber'}>{configured ? '已连接' : '未连接'}</Badge>
                        <button
                            type="button"
                            className="page-btn"
                            disabled={!configured || loadingModels}
                            onClick={() => setModelRefreshToken(current => current + 1)}
                        >
                            {loadingModels ? '读取中...' : '刷新模型'}
                        </button>
                    </div>
                </div>

                <div className="model-router-grid">
                    <div className="model-router-summary">
                        <div className="selected-path">
                            当前默认：{defaultModel || selectedModel || '未选择'}
                        </div>
                        <div className="model-meta-grid">
                            <div>
                                <span className="stat-label">账号</span>
                                <strong>{accountLabel || auth?.user?.username || '当前账号'}</strong>
                            </div>
                            <div>
                                <span className="stat-label">模型数</span>
                                <strong>{formatNumber(models.length)}</strong>
                            </div>
                            <div>
                                <span className="stat-label">文本</span>
                                <strong>{formatNumber(modelStats.text)}</strong>
                            </div>
                            <div>
                                <span className="stat-label">图像 / 视频</span>
                                <strong>{formatNumber(modelStats.image)} / {formatNumber(modelStats.video)}</strong>
                            </div>
                        </div>
                    </div>

                    <form className="model-config-form" onSubmit={saveModelSettings}>
                        <label className="form-field">
                            <span>选择默认模型</span>
                            <select
                                value={selectedModel}
                                onChange={event => setSelectedModel(event.target.value)}
                                disabled={!configured || loadingModels}
                            >
                                <option value="">{loadingModels ? '读取中...' : '请选择模型'}</option>
                                {modelOptions.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {modelTypeLabel(item.type)} · {item.id}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="form-field">
                            <span>自定义模型 ID</span>
                            <input
                                value={customModel}
                                onChange={event => setCustomModel(event.target.value)}
                                placeholder="不在列表中时填写"
                                disabled={!configured}
                            />
                        </label>
                        <button type="submit" className="page-btn" disabled={!configured || savingModel}>
                            {savingModel ? '保存中...' : '保存模型'}
                        </button>
                    </form>
                </div>

                {modelError ? <div className="form-error">{modelError}</div> : null}
                {modelSavedAt ? (
                    <div className="diagnosis-meta">
                        已保存：{formatDateTime(modelSavedAt)}
                    </div>
                ) : null}
            </article>

            <article className="card">
                <div className="card-header">
                    <div>
                        <div className="section-label">SETUP CHECKLIST</div>
                        <div className="card-title">需要处理吗</div>
                    </div>
                    <Badge tone={setupRows.every(row => row.ok || !row.required) ? 'green' : 'amber'}>
                        {setupRows.filter(row => row.required && !row.ok).length} 项必处理
                    </Badge>
                </div>
                <DataTable
                    columns={[
                        { key: 'name', label: '项目' },
                        {
                            key: 'ok',
                            label: '状态',
                            render: row => <Badge tone={row.ok ? 'green' : row.required ? 'red' : 'amber'}>{row.ok ? 'OK' : row.required ? '需处理' : '可选'}</Badge>,
                        },
                        { key: 'detail', label: '当前情况' },
                        { key: 'action', label: '建议' },
                    ]}
                    rows={setupRows}
                    rowKey="name"
                    pageSize={6}
                    minWidth={760}
                />
            </article>

            <article className="card">
                <div className="card-header">
                    <div>
                        <div className="section-label">CONTRACT TREE</div>
                        <div className="card-title">合同树概览</div>
                    </div>
                    {contractsSummary ? <Badge tone="purple">{formatChapterLabel(contractsSummary.chapter)}</Badge> : null}
                </div>
                <DataTable
                    columns={[
                        { key: 'type', label: '类型' },
                        {
                            key: 'count',
                            label: '数量',
                            render: row => <Badge tone={row.count > 0 ? 'green' : 'red'}>{row.count}</Badge>,
                        },
                        { key: 'desc', label: '说明' },
                    ]}
                    rows={contractRows}
                    rowKey="type"
                    pageSize={6}
                    emptyText="暂无合同树数据"
                    minWidth={680}
                />
            </article>

            <article className="card">
                <div className="card-header">
                    <div>
                        <div className="section-label">RECENT COMMITS</div>
                        <div className="card-title">最近 Commit 历史</div>
                    </div>
                    <Badge tone="amber">{commits.length} 条</Badge>
                </div>
                <DataTable
                    columns={[
                        {
                            key: 'chapter',
                            label: '章节',
                            render: row => formatChapterLabel(row.chapter),
                        },
                        {
                            key: 'status',
                            label: '状态',
                            render: row => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
                        },
                        {
                            key: 'state',
                            label: 'state',
                            render: row => <Badge tone={statusTone(row.projection_status?.state)}>{row.projection_status?.state || '—'}</Badge>,
                        },
                        {
                            key: 'index',
                            label: 'index',
                            render: row => <Badge tone={statusTone(row.projection_status?.index)}>{row.projection_status?.index || '—'}</Badge>,
                        },
                        {
                            key: 'summary',
                            label: 'summary',
                            render: row => <Badge tone={statusTone(row.projection_status?.summary)}>{row.projection_status?.summary || '—'}</Badge>,
                        },
                        {
                            key: 'memory',
                            label: 'memory',
                            render: row => <Badge tone={statusTone(row.projection_status?.memory)}>{row.projection_status?.memory || '—'}</Badge>,
                        },
                        {
                            key: 'vector',
                            label: 'vector',
                            render: row => <Badge tone={statusTone(row.projection_status?.vector)}>{row.projection_status?.vector || '—'}</Badge>,
                        },
                        {
                            key: 'updated_at',
                            label: '更新时间',
                            render: row => formatDateTime(row.updated_at),
                        },
                    ]}
                    rows={commits}
                    rowKey={(row, index) => `${row.chapter || 0}-${index}`}
                    pageSize={8}
                    emptyText="暂无 commit 记录"
                    minWidth={980}
                />
            </article>

            <article className="card">
                <div className="card-header">
                    <div>
                        <div className="section-label">RAG DIAGNOSIS</div>
                        <div className="card-title">RAG 环境</div>
                    </div>
                    <button
                        type="button"
                        className="page-btn"
                        disabled={probing}
                        onClick={() => {
                            setProbing(true)
                            probeEnvStatus()
                                .then(payload => setProbeResult(payload))
                                .finally(() => setProbing(false))
                        }}
                    >
                        {probing ? '诊断中…' : '运行诊断'}
                    </button>
                </div>
                {probeResult?.checked_at ? (
                    <div className="diagnosis-meta">
                        上次诊断：{formatDateTime(probeResult.checked_at)} · {probeResult.ok ? '全部通过' : '存在缺项'}
                    </div>
                ) : null}
                <DataTable
                    columns={[
                        { key: 'name', label: '组件' },
                        {
                            key: 'ok',
                            label: '状态',
                            render: row => <Badge tone={row.ok ? 'green' : 'red'}>{row.ok ? 'OK' : '缺失'}</Badge>,
                        },
                        { key: 'detail', label: '详情' },
                    ]}
                    rows={envRows}
                    rowKey="name"
                    pageSize={6}
                    emptyText="暂无环境信息"
                    minWidth={680}
                />
            </article>
        </section>
    )
}
