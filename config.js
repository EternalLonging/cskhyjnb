// =============================================================================
// config.js — 全局常量和变量声明
// 依赖：questions.js（需先加载，提供 window.QUESTION_BANK / window.QUESTION_SUMMARY）
// =============================================================================

const baseQuestions = window.QUESTION_BANK || [];
const baseSummary = window.QUESTION_SUMMARY || {};
let questions = [];
let summary = {};
let topicHierarchyCache = null;
let allTopicKeysCache = null;
let metaCloudTimer = null;
const $ = (id) => document.getElementById(id);

const WRONG_KEY = 'quiz_wrong_ids_v1';
const SETTINGS_KEY = 'quiz_settings_v2';
const PROGRESS_KEY = 'quiz_progress_v4';
const NOTE_KEY = 'quiz_question_notes_v1';
const META_TS_KEY = 'quiz_meta_updated_at_v1';
const FORCE_RESTART_KEY = 'quiz_force_restart_v1';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const AUTO_NEXT_DELAY = 420;


// Supabase 同步配置：Project URL 必须是 https://xxxx.supabase.co，不带 /rest/v1/。
const SUPABASE_URL = 'https://mcesiailoesdmrugfijo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Ln4ICHH6m4OsGuK9p6SqIA_GNg4_ARI';
const SYNC_KEY_STORAGE = 'quiz_sync_key_v1';
const ACCESS_MODE_STORAGE = 'quiz_access_mode_v1';
const ACCESS_MODE_SYNC = 'sync';
const ACCESS_MODE_SINGLE = 'single';
const SYNC_META_DECK = '__meta_v1__';
// 题解和评论改为全站共享：不同同步码只区分个人进度，不再区分题解/评论。
const SHARED_NOTE_SYNC_KEY = '__shared_question_notes_v2__';
const COMMENT_CLIENT_ID_STORAGE = 'quiz_comment_client_id_v1';
const QUESTION_EDIT_KEY = 'quiz_question_edits_v1';
const QUESTION_EDIT_SYNC_KEY = '__shared_question_bank_edits_v1__';
const QUESTION_EDIT_DECK_KEY = '__question_edits_v1__';
const ADMIN_AUTH_KEY = 'quiz_admin_unlocked_v1';
const ADMIN_PASSWORD = 'fengxingadmin';
const ADMIN_PASSWORD_STORAGE = 'quiz_admin_password_v1';
const ADMIN_PASSWORD_TS_STORAGE = 'quiz_admin_password_updated_at_v1';
const ADMIN_PASSWORD_SYNC_KEY = '__site_admin_settings_v1__';
const ADMIN_PASSWORD_DECK_KEY = '__admin_password_v1__';
const INVITE_AUTH_STORAGE = 'quiz_sync_invite_authorized_v1';
const DEFAULT_INVITE_CODE = 'fengxing';
const INVITE_SYNC_PREFIX = '__sync_invite_v1__:'; // 兼容旧版本字段名，新版不再按同步码区分邀请码
const INVITE_DECK_KEY = '__invite_code__';
const GLOBAL_INVITE_SYNC_KEY = '__global_invite_settings_v1__';
const GLOBAL_INVITE_DECK_KEY = '__global_invite_code_v1__';
const SINGLE_MODE_AUTH_ID = '__single_mode__';
const COURSE_TAGS_STORAGE = 'quiz_course_tags_v1';
const COURSE_TAGS_TS_STORAGE = 'quiz_course_tags_updated_at_v1';
const COURSE_TAGS_SYNC_KEY = '__shared_course_tags_v1__';
const COURSE_TAGS_DECK_KEY = '__course_tags_v1__';
const CLOUD_CHECK_INTERVAL = 2 * 60 * 1000;
const QUESTION_EDIT_CLOUD_CHECK_KEY = 'quiz_question_edits_cloud_checked_at_v1';
const COURSE_TAGS_CLOUD_CHECK_KEY = 'quiz_course_tags_cloud_checked_at_v1';
const ADMIN_PASSWORD_CLOUD_CHECK_KEY = 'quiz_admin_password_cloud_checked_at_v1';

// 全站题目统计（所有用户答题总次数和正确次数）
const QUESTION_STATS_SYNC_KEY = '__shared_question_stats_v2__';
const QUESTION_STATS_PREFIX = 'qstats:';

// 历史刷题记录：每个同步码（云端）/每台设备（单机）保留最近 N 条。
const HISTORY_KEY = 'quiz_history_v1';        // 单机模式本地历史记录数组
const HISTORY_MAX = 5;                        // 最多保留条数
const HISTORY_DECK_PREFIX = 'history:';       // 云端 deck_key 前缀
