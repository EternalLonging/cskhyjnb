// =============================================================================
// topic-manager.js - 专题树管理（课程/专题/小专题的 CRUD + 层级构建）
// 依赖：config.js, utils.js, data.js（loadQuestionEdits, saveQuestionEditsLocal 等）
// ponytail: 把分散在 ui.js/data.js 里的专题管理集中到这里，一个模块一个职责
// =============================================================================

"use strict";

// ——— 数据模型 ———
// edits.customCourses: [{ course: string, topics: string[] }]
// edits.customSubTopics: [{ course: string, topic: string, subtopic: string }]

const CHANGYONG_CUSTOM_COURSE = "自定义课程";

function ensureCustomCourses(edits) {
  if (!Array.isArray(edits.customCourses)) edits.customCourses = [];
  // 从旧 customTopics 迁移到 customCourses
  if (Array.isArray(edits.customTopics) && edits.customTopics.length) {
    const migrated = (edits.customTopics || []).map(function(t) { return String(t).trim(); }).filter(Boolean);
    if (migrated.length) {
      var cc = edits.customCourses.find(function(c) { return c.course === CHANGYONG_CUSTOM_COURSE; });
      if (!cc) { cc = { course: CHANGYONG_CUSTOM_COURSE, topics: [] }; edits.customCourses.push(cc); }
      migrated.forEach(function(t) { if (cc.topics.indexOf(t) === -1) cc.topics.push(t); });
    }
    edits.customTopics = [];
  }
  return edits;
}

// ——— 课程 CRUD ———

function addCustomCourse(name) {
  var course = String(name || "").trim();
  if (!course) throw new Error("请输入课程名称。");
  var edits = ensureCustomCourses(loadQuestionEdits());
  if (edits.customCourses.some(function(c) { return c.course === course; })) throw new Error("课程已存在。");
  edits.customCourses.push({ course: course, topics: [] });
  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
  return course;
}

function renameCourse(oldName, newName) {
  var oldCourse = String(oldName || "").trim();
  var newCourse = String(newName || "").trim();
  if (!oldCourse) throw new Error("请选择要修改的课程。");
  if (!newCourse) throw new Error("请输入新的课程名称。");
  if (oldCourse === newCourse) throw new Error("新旧课程名称相同。");

  var changedCount = 0;
  var edits = ensureCustomCourses(loadQuestionEdits());
  edits.overrides = edits.overrides || {};

  // 1. 修改所有题目里的 course
  questions.forEach(function(q) {
    var qCourse = String(q.course || "").trim();
    var derived = deriveCourseName(q);
    if (qCourse !== oldCourse && derived !== oldCourse) return;
    var id = String(q.id);
    q.course = newCourse;
    if (isBaseQuestionId(id)) {
      edits.overrides[id] = edits.overrides[id] || {};
      edits.overrides[id].course = newCourse;
    } else {
      var idx = edits.custom.findIndex(function(item) { return String(item.id) === id; });
      if (idx >= 0) edits.custom[idx].course = newCourse;
    }
    changedCount++;
  });

  // 2. 修改 summary
  if (summary[oldCourse]) {
    summary[newCourse] = summary[oldCourse];
    delete summary[oldCourse];
  }

  // 3. 修改 customSubTopics 里的 course
  (edits.customSubTopics || []).forEach(function(item) {
    if (item.course === oldCourse) item.course = newCourse;
  });

  // 4. 修改 customCourses
  var cc = edits.customCourses.find(function(c) { return c.course === oldCourse; });
  if (cc) cc.course = newCourse;

  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
  return { oldCourse: oldCourse, newCourse: newCourse, changedCount: changedCount };
}

function deleteCourse(course) {
  var c = String(course || "").trim();
  if (!c) return;
  var edits = ensureCustomCourses(loadQuestionEdits());

  // 删除所有属于该课程的题目
  questions.forEach(function(q) {
    if (String(q.course || "").trim() === c || deriveCourseName(q) === c) {
      edits.deletedIds.push(String(q.id));
    }
  });
  edits.deletedIds = Array.from(new Set(edits.deletedIds));

  // 清理 customCourses
  edits.customCourses = edits.customCourses.filter(function(cc) { return cc.course !== c; });
  // 清理 customSubTopics
  edits.customSubTopics = (edits.customSubTopics || []).filter(function(item) { return item.course !== c; });

  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}

// ——— 专题 CRUD ———

function addTopicToCourse(course, topicName) {
  var c = String(course || "").trim();
  var t = String(topicName || "").trim();
  if (!t) throw new Error("请输入专题名称。");

  var edits = ensureCustomCourses(loadQuestionEdits());

  var cc = edits.customCourses.find(function(x) { return x.course === c; });
  if (!cc) { cc = { course: c, topics: [] }; edits.customCourses.push(cc); }
  if (cc.topics.indexOf(t) === -1) cc.topics.push(t);

  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}

function deleteTopic(course, topicName) {
  var c = String(course || "").trim();
  var t = String(topicName || "").trim();
  if (!c || !t) return;

  var edits = ensureCustomCourses(loadQuestionEdits());

  var cc = edits.customCourses.find(function(x) { return x.course === c; });
  if (cc) cc.topics = cc.topics.filter(function(tp) { return tp !== t; });

  edits.customSubTopics = (edits.customSubTopics || []).filter(function(item) {
    return !(item.course === c && item.topic === t);
  });

  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}

// ——— 小专题 CRUD ———

function addSubTopic(course, topic, subtopicName) {
  var c = String(course || "").trim();
  var t = String(topic || "").trim();
  var s = String(subtopicName || "").trim();
  if (!c || !t || !s) throw new Error("课程、专题、小专题名不能为空。");

  var edits = ensureCustomCourses(loadQuestionEdits());
  edits.customSubTopics = edits.customSubTopics || [];
  edits.customSubTopics.push({ course: c, topic: t, subtopic: s });

  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}

function deleteSubTopic(course, topic, subtopicName) {
  var c = String(course || "").trim();
  var t = String(topic || "").trim();
  var s = String(subtopicName || "").trim();
  if (!c || !t || !s) return;

  var edits = ensureCustomCourses(loadQuestionEdits());
  edits.customSubTopics = (edits.customSubTopics || []).filter(function(item) {
    return !(item.course === c && item.topic === t && item.subtopic === s);
  });

  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}

// ——— 专题重命名 ———

function renameTopic(course, oldTopic, newTopic) {
  var c = String(course || "").trim();
  var oldT = String(oldTopic || "").trim();
  var newT = String(newTopic || "").trim();
  if (!c || !oldT || !newT) throw new Error("参数不完整。");
  if (oldT === newT) throw new Error("新旧专题名称相同。");
  var edits = ensureCustomCourses(loadQuestionEdits());
  // customCourses
  var cc = edits.customCourses.find(function(x) { return x.course === c; });
  if (cc) {
    var idx = cc.topics.indexOf(oldT);
    if (idx >= 0) cc.topics[idx] = newT;
  }
  // customSubTopics
  (edits.customSubTopics || []).forEach(function(item) {
    if (item.course === c && item.topic === oldT) item.topic = newT;
  });
  // overrides
  edits.overrides = edits.overrides || {};
  questions.forEach(function(q) {
    if (deriveCourseName(q) !== c) return;
    var qTopic = q.topic || q.type;
    if (qTopic === oldT) {
      var id = String(q.id);
      edits.overrides[id] = edits.overrides[id] || {};
      edits.overrides[id].topic = newT;
    }
  });
  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}

function renameSubTopic(course, topic, oldSub, newSub) {
  var c = String(course || "").trim();
  var t = String(topic || "").trim();
  var oldS = String(oldSub || "").trim();
  var newS = String(newSub || "").trim();
  if (!c || !t || !oldS || !newS) throw new Error("参数不完整。");
  if (oldS === newS) throw new Error("新旧小专题名称相同。");
  var edits = ensureCustomCourses(loadQuestionEdits());
  edits.customSubTopics = edits.customSubTopics || [];
  edits.customSubTopics.forEach(function(item) {
    if (item.course === c && item.topic === t && item.subtopic === oldS) item.subtopic = newS;
  });
  edits.overrides = edits.overrides || {};
  questions.forEach(function(q) {
    if (deriveCourseName(q) !== c) return;
    var qTopic = q.topic || q.type;
    if (qTopic !== t) return;
    var qSub = q.subtopic || q.topicLabel || '';
    if (qSub === oldS) {
      var id = String(q.id);
      edits.overrides[id] = edits.overrides[id] || {};
      edits.overrides[id].subtopic = newS;
    }
  });
  topicHierarchyCache = null; allTopicKeysCache = null;
  saveQuestionEditsLocal(edits);
}