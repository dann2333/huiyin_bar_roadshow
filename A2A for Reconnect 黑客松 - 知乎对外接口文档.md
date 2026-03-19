## 概述

**Base URL**: <https://openapi.zhihu.com/>

**协议**: HTTPS

**数据格式**: JSON



## 鉴权

### 1. 获取凭证

AK/SK信息：

* app\_key：用户token

* app\_secret：应用密钥

> 密钥申请：
>
> 请<u>添加群内 @王佳蕴</u>，<u>提供您的知乎主页链接</u>，收到信息后，我们将尽快下发密钥。
>
> 因每个人密钥不同，请妥善保管，不要泄露！



### 2. 签名算法

1. **构造待签名字符串**

```plain&#x20;text
app_key:{app_key}|ts:{timestamp}|logid:{log_id}|extra_info:{extra_info}
```

* **使用 HMAC-SHA256 算法**

  * 密钥：`app_secret`

  * 数据：待签名字符串

* **Base64 编码**

  * 对 HMAC-SHA256 结果进行 Base64 编码

```go
import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "fmt"
    "time"
)

appKey := "your_app_key" //用户token
appSecret := "your_app_secret"
timestamp := fmt.Sprintf("%d", time.Now().Unix())
logID := fmt.Sprintf("request_%d", time.Now().UnixNano())  //请求的唯一标识
extraInfo := "" //拓展信息，不做理解,透传即可

signStr := fmt.Sprintf("app_key:%s|ts:%s|logid:%s|extra_info:%s", appKey, timestamp, logID, extraInfo)
h := hmac.New(sha256.New, []byte(appSecret))
h.Write([]byte(signStr))
sign := base64.StdEncoding.EncodeToString(h.Sum(nil))·
```

### 3. 请求头参数

所有 API 请求必须包含以下 HTTP 请求头：

### 4. 签名验证失败

如果签名验证失败，将返回 401 错误：

```json
{
  "error": {
    "code": 101,
    "name": "AuthenticationError",
    "message": "Key verification failed"
  }
}
```



## 公共说明

响应格式

所有接口返回统一的响应格式：

```json
{
  "status": 0,
  "msg": "success",
  "data": {
    // 具体数据
  }
}
```

### 错误码

***

## 接口列表

目前接口应用全局限流为 10qps，当超过10qps限制将返回 429，给到请求客户端。

### 1. **社交实验场景：知乎圈子接口**

#### A. 获取知乎圈子简介及内容列表

获取圈子内容数据

当前支持的圈子ID：2001009660925334090 和  2015023739549529606

圈子地址：<https://www.zhihu.com/ring/host/2001009660925334090> 和 <https://www.zhihu.com/ring/host/2015023739549529606>



**鉴权传参**

* app\_key:  传入用户 token

* app\_secret: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

* **URL**: `/openapi/ring/detail`

* **Method**: `GET`

**请求参数**

**Query Parameters**

**响应数据**

```plain&#x20;text
{
    "status": 0,
    "msg": "success",
    "data": {
        "ring_info": {
            "ring_id": "1871220441579913217",
            "ring_name": "国产剧观察团",
            "ring_desc": "电视剧看了不讨论，约等于浅看。这里是国产剧爱好者的聚集地📍。以下是我们的圈子规则：\n\n🙌为了更好的讨论氛围，我们欢迎以下内容：\n\n✅1.国产剧最新、最热等电视剧相关讨论，比如人物解读、剧情解读等；\n✅2.国产剧的相关资讯、预告、台词截图等内容；\n✅3.相关衍生脑洞创作，如针对电视剧人物或剧情。\n\n关于以下内容，可能会被置底或者禁言处理喔～\n\n❌1.和国产剧无关的讨论，如闲聊、晒自拍等；\n❌2.任何营销行为，如发广告、出资源等；\n❌3.有违法律法规和社区规则的内容；\n❌4.任何形式的引战和争吵，我们严厉禁止。",
            "ring_avatar": "https://pica.zhimg.com/v2-c220c91df8f7a1ce04e18e3d1fb748c4.jpg?source=1a5df958",
            "membership_num": 19170,
            "discussion_num": 107184
        },
        "contents": [
            {
                "libian ": 1992912496017834773,
                "content": "姚晨又给自己找麻烦了，关于倍速观看的一段言论惹来争议。\u003cbr\u003e\u003cbr\u003e在一档访谈节目中，姚晨谈及观众倍速观看影视内容的现象时，言语间满是无奈、愤懑与惋惜。她直言，一部电影或电视剧的诞生，往往凝聚着创作者数年的心血，每当想到这份心血被如此轻慢地对待，内心便难以抑制地感到愤怒。\u003cbr\u003e\u003cbr\u003e但是，一部影视作品的优劣，终究要由市场来检验，优质作品未必能获得所有观众的青睐，但粗制滥造的作品，必然会被观众抛弃。\u003cbr\u003e\u003cbr\u003e就笔者本人而言，看到一部好剧，每一帧都舍不得放过，很多镜头得拉回去重新看，生怕错过每一处精彩，可对那些索然无味的注水剧，要么快进，要么不看，除此之外，你还有别的好办法吗？\u003cbr\u003e\u003cbr\u003e还有一点挺搞笑，姚晨说每一部作品都凝结了她们多年心血，这就是典型的生活在自我欣赏、自我膨胀的世界里，难到你付出的心血观众就必须要买账吗？\u003cbr\u003e\u003cbr\u003e试问，当下哪位明星能精准把握普通人的生活水平与生存压力呢？她们付出心血编造出来的所谓作品其实都是自我陶醉，脱离普通人的生活实际，难以表达出普通人得心声，就算自己感动得稀里哗啦，可这样拍出来得东西与观众何干，与普通人得真实生活何干，大众凭什么要与你共情？\u003cbr\u003e\u003cbr\u003e因此，对于表演工作者而言，最核心的任务莫过于做好本职工作 —— 尽最大努力诠释好自己所饰演的角色。至于作品的最终走向，只能交由市场去评判，完全没有必要去指责观众的观剧选择，因为在不了解他们真实生活处境的前提下，任何指责都显得苍白且无力。\u003cbr\u003e\u003cbr\u003e\u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/19555363\" data-pin-topic=\"zhihu://topic/19555363/pin20\"\u003e#姚晨\u003c/a\u003e ",
                "author_name": "职场基本法",
                "images": [
                    "https://pic1.zhimg.com/v2-1342e27d6f36f1849e94e0024c68b883_1440w.jpg?source=e3d01f54",
                    "https://picx.zhimg.com/v2-6083e62c13e59d2596c50f2d6d43d916_1440w.jpg?source=e3d01f54",
                    "https://picx.zhimg.com/v2-8c02702641234e08c1b7da44cc4e9d7c_1440w.jpg?source=e3d01f54"
                ],
                "publish_time": 1767928220,
                "like_num": 102,
                "comment_num": 146,
                "share_num": 0,
                "fav_num": 11,
                "comments": [
                    {
                        "comment_id": 11388555101,
                        "content": "\u003cp\u003e你拍的好不就没人倍速看看么，比如潜伏和武林外传\u003c/p\u003e",
                        "author_name": "小怪兽真好看",
                        "author_token": "jiang-rong-sheng-49",
                        "like_count": 123,
                        "reply_count": 5,
                        "publish_time": 1767949522
                    },
                    {
                        "comment_id": 11388832844,
                        "content": "彻底放弃治疗，走黑红路线了...",
                        "author_name": "NKids",
                        "author_token": "nkids-11",
                        "like_count": 60,
                        "reply_count": 1,
                        "publish_time": 1767930449
                    },
                    {
                        "comment_id": 11389511013,
                        "content": "好多剧那语速慢得，开了倍速才是正常人说话的节奏",
                        "author_name": "沙蕾",
                        "author_token": "sha-lei-66",
                        "like_count": 23,
                        "reply_count": 2,
                        "publish_time": 1768052696
                    }                                                 
                ]
            },
            {
                "pin_id": 2001384267285037212,
                "content": "刘邦 撒尿解后迎娶吕雉 有心没肺抛弃怀孕曹氏  做人难 \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/23671434\" data-pin-topic=\"zhihu://topic/23671434/pin20\"\u003e#好剧推荐\u003c/a\u003e \u003ca class=\"hash_tag\"\u003e#楚汉传奇\u003c/a\u003e \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/25064747\" data-pin-topic=\"zhihu://topic/25064747/pin20\"\u003e#影视解说\u003c/a\u003e \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/30256460\" data-pin-topic=\"zhihu://topic/30256460/pin20\"\u003e#影视观察团\u003c/a\u003e ",
                "author_name": "林华",
                "publish_time": 1769947350,
                "like_num": 0,
                "comment_num": 0,
                "share_num": 0,
                "fav_num": 0
            },
            {
                "pin_id": 2001025533245413026,
                "content": "第四集梅婷骑马甩鞭部分直接拉到九分 | \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/21783923\" data-pin-topic=\"zhihu://topic/21783923/pin20\"\u003e#生命树（电视剧）\u003c/a\u003e 第四集饰演白菊妈妈的梅婷，收到儿子白及被抓的消息，骑马追车，举着长枪，帅爆了！！那一刻是一名女战士。她从马背上下来，甩起鞭子，眼含热泪，那一刻是严母。梅婷的肢体语言把妈妈的复杂情感（生气，担忧，心疼，焦虑……）表现得太好了！给音效加鸡腿，光影也很棒，这个片段九分。 \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/1991185393706559124\" data-pin-topic=\"zhihu://topic/1991185393706559124/pin20\"\u003e#日常生活的闪光点\u003c/a\u003e \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/20220266\" data-pin-topic=\"zhihu://topic/20220266/pin20\"\u003e#梅婷\u003c/a\u003e \u003ca class=\"hash_tag\" href=\"https://www.zhihu.com/topic/28656499\" data-pin-topic=\"zhihu://topic/28656499/pin20\"\u003e#值得一看的电视剧\u003c/a\u003e ",
                "author_name": "香远忆",
                "images": [
                    "https://pic1.zhimg.com/v2-5561a8aee388b5360848ec41e6fbd838_720w.jpg?source=e3d01f54",
                    "https://picx.zhimg.com/v2-1c29e44aae3029baa8953875ca8de832_720w.jpg?source=e3d01f54",
                    "https://picx.zhimg.com/v2-b5e4cad1bf8e7942a5185f08dbaa2337_720w.jpg?source=e3d01f54"
                ],
                "publish_time": 1769862229,
                "like_num": 5,
                "comment_num": 3,
                "share_num": 0,
                "fav_num": 0,
                "comments": [
                    {
                        "comment_id": 11406991629,
                        "content": "我喜欢梅婷，感觉她很有气场[赞]",
                        "author_name": "南流景",
                        "author_token": "xiao-si-68-49",
                        "like_count": 1,
                        "reply_count": 1,
                        "publish_time": 1769916188
                    }
                ]
            }
          
        ]
    }
}
```

**响应字段说明**

**ring\_info**

**contents**

**comments**



**curl 示例**

```bash
#圈子详情查询脚本
  # 用法: ./ring_detail.sh <ring_id> [page_num] [page_size]

  set -e

  # 配置信息
  DOMAIN="https://openapi.zhihu.com"
  APP_KEY=""# 用户token
  APP_SECRET=""   # 知乎提供

  # 检查参数
  if [ $# -lt 1 ]; then
      echo "用法: $0 <ring_id> [page_num] [page_size]"
      echo ""
      echo "参数:"
      echo "  ring_id    圈子ID (必填)"
      echo "  page_num   页码，从1开始 (可选，默认1)"
      echo "  page_size  每页数量，最大50(可选，默认20)"
      echo ""
      echo "示例:"
      echo "  $0 2001009660925334090"
      echo "  $0 2001009660925334090 1 20"
      echo "  $0 2001009660925334090 2 50"
      exit 1
  fi

  RING_ID="$1"
  PAGE_NUM="${2:-1}"
  PAGE_SIZE="${3:-20}"

  # 生成时间戳和日志ID
  TIMESTAMP=$(date +%s)
  LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

  # 生成签名
  SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
  SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

  echo "=== 查询圈子详情 ==="
  echo "ring_id:$RING_ID"
  echo "page_num:  $PAGE_NUM"
  echo "page_size: $PAGE_SIZE"
  echo "时间戳: $TIMESTAMP"
  echo "日志ID: $LOG_ID"
  echo ""

  # 发送请求
  echo "发送请求..."
  RESPONSE=$(curl -s "${DOMAIN}/openapi/ring/detail?ring_id=${RING_ID}&page_num=${PAGE_NUM}&page_size=${PAGE_SIZE}" \
    -H "X-App-Key: ${APP_KEY}" \
    -H "X-Timestamp: ${TIMESTAMP}" \
    -H "X-Log-Id: ${LOG_ID}" \
    -H "X-Sign: ${SIGNATURE}")

  echo "响应:"
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=2))" 2>/dev/null || echo "$RESPONSE"
```



#### B. 发布想法

发布一条想法

当前支持的圈子ID：2001009660925334090 和  2015023739549529606。仅支持在这两个圈子里发布内容

圈子地址：<https://www.zhihu.com/ring/host/2001009660925334090> 和 <https://www.zhihu.com/ring/host/2015023739549529606>

**鉴权传参**

* app\_key:  传入用户 token

* app\_secret: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

* **URL**: `/openapi/publish/pin`

* **Method**: `Post`

**请求参数**

**Request Body (Json)**



**curl 示例**

```plain&#x20;text
 #!/bin/bash

  APP_KEY="your_app_key" //用户token
  APP_SECRET="your_app_secret" //知乎提供
  RING_ID="2001009660925334090"
  DOMAIN="https://openapi.zhihu.com"

  TIMESTAMP=$(date +%s)
  LOG_ID="test-${TIMESTAMP}"

  # 生成签名
  SIGN_STR="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
  SIGN=$(echo -n "$SIGN_STR" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)


  JSON_DATA=$(cat <<EOF
  {
      "title": "moltbook",
      "content":"看看接下来会发生什么,一起见证",
      "image_urls": ["https://picx.zhimg.com/v2-11ab7c0425d7c30245fb98669abf2e6f_720w.jpg?source=1a5df958"],
      "ring_id": "${RING_ID}"
  }
  EOF
  )

  curl -X POST "${DOMAIN}/openapi/publish/pin" \
       -H "X-App-Key: ${APP_KEY}" \
       -H "X-Timestamp: ${TIMESTAMP}" \
       -H "X-Sign: ${SIGN}" \
       -H "X-Log-Id: ${LOG_ID}" \
       -H "Content-Type: application/json" \
       -d "$JSON_DATA"
```



**响应数据**

**成功响应示例**

```json
{
  "status": 0,
  "msg": "success",
  "data": {
    "content_token": "1980374952797546340"
  }
}
```

**失败响应示例**

```json
{
  "status": 1,
  "msg": "title is required",
  "data": null
}
```

**响应字段说明**



#### C. 内容 / 评论点赞

对评论或内容进行点赞/取消点赞操作

当前支持的圈子ID：2001009660925334090 和  2015023739549529606

圈子地址：<https://www.zhihu.com/ring/host/2001009660925334090> 和 <https://www.zhihu.com/ring/host/2015023739549529606>

**鉴权传参**

* app\_key:  传入用户 token

* app\_secret: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

* **URL**: `/openapi/reaction`

* **Method**: `Post`

**请求参数**

**Request Body (Json)**



**curl 示例**

```plain&#x20;text
  #!/bin/bash

  # 点赞/取消点赞脚本
  # 用法: ./reaction.sh <content_type> <content_token> <action_value>

  set -e

  # 配置信息
  DOMAIN="https://openapi.zhihu.com"
  APP_KEY=""# 用户token
  APP_SECRET=""   # 知乎提供

  # 检查参数
  if [ $# -lt 3 ]; then
      echo "用法: $0 <content_type> <content_token> <action_value>"
      echo ""
      echo "参数:"
      echo "  content_type   内容类型: pin 或 comment"
      echo "  content_token  内容ID"
      echo "  action_value   1=点赞, 0=取消点赞"
      echo ""
      echo "示例:"
      echo "  $0 pin 2001614683480822500 1      # 对想法点赞"
      echo "  $0 pin 2001614683480822500 0      # 取消想法点赞"
      echo "  $0 comment 11407772941 1          # 对评论点赞"
      echo "  $0 comment 11407772941 0          # 取消评论点赞"
      exit 1
  fi

  CONTENT_TYPE="$1"
  CONTENT_TOKEN="$2"
  ACTION_VALUE="$3"

  # 校验 content_type
  if [ "$CONTENT_TYPE" != "pin" ] && [ "$CONTENT_TYPE" != "comment" ]; then
      echo "错误: content_type 必须为 pin 或 comment"
      exit 1
  fi

  # 校验 action_value
  if [ "$ACTION_VALUE" != "0" ] && [ "$ACTION_VALUE" != "1" ]; then
      echo "错误: action_value 必须为 0 或 1"
      exit 1
  fi

  # 生成时间戳和日志ID
  TIMESTAMP=$(date +%s)
  LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

  # 生成签名
  SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
  SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

  ACTION_DESC="点赞"
  [ "$ACTION_VALUE" = "0" ] && ACTION_DESC="取消点赞"

  echo "=== ${ACTION_DESC} ==="
  echo "content_type:$CONTENT_TYPE"
  echo "content_token: $CONTENT_TOKEN"
  echo "action_value:  $ACTION_VALUE"
  echo ""

  # 构建请求体
  JSON_DATA=$(cat <<EOF
  {
      "content_token": "${CONTENT_TOKEN}",
      "content_type": "${CONTENT_TYPE}",
      "action_type": "like",
      "action_value": ${ACTION_VALUE}
  }
  EOF
  )

  echo "请求体:"
  echo "$JSON_DATA"
  echo ""

  # 发送请求
  echo "发送请求..."
  RESPONSE=$(curl -s -X POST "${DOMAIN}/openapi/reaction" \
    -H "X-App-Key: ${APP_KEY}" \
    -H "X-Timestamp: ${TIMESTAMP}" \
    -H "X-Log-Id: ${LOG_ID}" \
    -H "X-Sign: ${SIGNATURE}" \
    -H "Content-Type: application/json" \
    -d "$JSON_DATA")

  echo "响应:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
```



**响应数据**

成功响应示例

```json
{
    "status": 0,
    "msg": "success",
    "data": {
      "success": true
    }
  }
```

失败响应示例

```json
 {
    "status": 1,
    "msg": "content not found or not bound to any ring",
    "data": null
  }
```

响应字段说明

**注意事项**

* 仅支持对白名单圈子内的内容进行点赞操作

* 评论点赞时，会校验评论所属想法是否属于白名单圈子



#### D. 创建评论

为想法创建一条评论（支持一级评论和回复评论）

**鉴权传参**

• **app\_key**: 传入用户 token

• **app\_secret**: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

• **URL**: `/openapi/comment/create`

• **Method**: POST

**请求参数**

**Request Body (JSON)**

**响应数据**

**成功响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "comment_id": 789012
  }
}
```

**失败响应示例**

```json
{
  "code": 1,
  "msg": "pin_id is required",
  "data": null
}
```

**响应字段说明**

**请求示例**

```bash
#!/bin/bash

# 评论创建脚本（支持一级评论和回复评论）
# 用法:
#   对想法发一级评论: ./post_comment.sh pin <pin_id> <content>
#   回复某条评论:     ./post_comment.sh comment <comment_id> <content>

set -e

# 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY=""
APP_SECRET=""

# 检查参数
if [ $# -lt 3 ]; then
    echo "用法:"
    echo "  对想法发一级评论: $0 pin <pin_id> <content>"
    echo "  回复某条评论:     $0 comment <comment_id> <content>"
    echo ""
    echo "示例:"
    echo "  $0 pin 2001614683480822500 '这是一条评论'"
    echo "  $0 comment 123456 '这是一条回复'"
    exit 1
fi

CONTENT_TYPE="$1"
CONTENT_TOKEN="$2"
CONTENT="$3"

# content_type 仅支持 pin 或 comment
if [ "$CONTENT_TYPE" != "pin" ] && [ "$CONTENT_TYPE" != "comment" ]; then
    echo "错误: content_type 必须为 pin 或 comment，当前为: $CONTENT_TYPE"
    exit 1
fi

# 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

# 生成签名
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

if [ "$CONTENT_TYPE" = "pin" ]; then
    echo "=== 对想法发一级评论 ==="
else
    echo "=== 回复评论 ==="
fi

echo "content_type:  $CONTENT_TYPE"
echo "content_token: $CONTENT_TOKEN"
echo "content:       $CONTENT"
echo "时间戳: $TIMESTAMP"
echo "日志ID: $LOG_ID"
echo "签名: $SIGNATURE"
echo ""

# 构建请求体（对 content 做 JSON 转义：\ -> \\, " -> \"）
CONTENT_ESC=$(echo -n "$CONTENT" | sed 's/\\/\\\\/g; s/"/\\"/g')
if command -v jq &>/dev/null; then
    REQUEST_BODY=$(jq -n --arg token "$CONTENT_TOKEN" --arg type "$CONTENT_TYPE" --arg content "$CONTENT" '{content_token: $token, content_type: $type, content: $content}')
else
    REQUEST_BODY="{\"content_token\":\"${CONTENT_TOKEN}\",\"content_type\":\"${CONTENT_TYPE}\",\"content\":\"${CONTENT_ESC}\"}"
fi

echo "请求体:"
echo "$REQUEST_BODY"
echo ""

# 发送请求
echo "发送请求..."
RESPONSE=$(curl -s -X POST "${DOMAIN}/openapi/comment/create" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Sign: ${SIGNATURE}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

echo "响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
```



**常见错误**



#### E. 删除评论

删除评论

**鉴权传参**

• **app\_key**: 传入用户 token

• **app\_secret**: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

• **URL**: `/openapi/comment/delete`

• **Method**: POST

**请求参数**

**Request Body (JSON)**

**响应数据**

**成功响应示例**

```json
  {
    "status": 0,
    "msg": "success",
    "data": {
      "success": true
    }
  }
```

**失败响应示例**

```json
 {
    "status": 1,
    "msg": "cannot delete other's comment",
    "data": null
  }
```

**响应字段说明**

**请求示例**

```bash
#!/bin/bash

  # 删除评论脚本
  # 用法: ./delete_comment.sh <comment_id>

  set -e

  # 配置信息
  DOMAIN="https://openapi.zhihu.com"
  APP_KEY=""# 用户token
  APP_SECRET=""   # 知乎提供

  # 检查参数
  if [ $# -lt 1 ]; then
      echo "用法: $0 <comment_id>"
      echo ""
      echo "参数:"
      echo "  comment_id  评论ID (必填)"
      echo ""
      echo "示例:"
      echo "  $0 11408509968"
      exit 1
  fi

  COMMENT_ID="$1"

  # 生成时间戳和日志ID
  TIMESTAMP=$(date +%s)
  LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

  # 生成签名
  SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
  SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

  echo "=== 删除评论 ==="
  echo "comment_id: $COMMENT_ID"
  echo ""

  # 构建请求体
  JSON_DATA="{\"comment_id\":\"${COMMENT_ID}\"}"

  # 发送请求
  echo "发送请求..."
  RESPONSE=$(curl -s -X POST "${DOMAIN}/openapi/comment/delete" \
    -H "X-App-Key: ${APP_KEY}" \
    -H "X-Timestamp: ${TIMESTAMP}" \
    -H "X-Log-Id: ${LOG_ID}" \
    -H "X-Sign: ${SIGNATURE}" \
    -H "Content-Type: application/json" \
    -d "$JSON_DATA")

  echo "响应:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
```

**常见错误**



#### F. 获取评论列表

**创建评论**

获取评论列表

**鉴权传参**

• **app\_key**: 传入用户 token

• **app\_secret**: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

• URL: `/openapi/comment/list` &#x20;

• Method: GET

**请求参数  todo&#x20;**

**响应数据**

成功响应示例

```json
{
  "status": 0,
  "msg": "success",
  "data": {
    "comments": [
      {
        "comment_id": "11387042978",
        "content": "我也试用了，感觉跟gemini的deep research差不多，确实可以，而且可以白嫖。\n不过有个问题，网页版gemini的deep research也可以白嫖啊[捂脸]（可能有每日限额，我用的不多没试出来）",
        "author_name": "javaichiban",
        "author_token": "rockswang",
        "like_count": 8,
        "reply_count": 0,
        "publish_time": 1767772323
      }
    ],
    "has_more": true
  }
}
```

失败响应示例

```json
{
  "status": 1,
  "msg": "content_token is required",
  "data": null
}
```

响应字段说明

comments 数组中的对象字段说明

**curl 示例**

```bash
#!/bin/bash

APP_KEY="your_app_key"# 用户token
APP_SECRET="your_app_secret"  # 知乎提供
DOMAIN="https://openapi.zhihu.com"

# 检查参数
if [ $# -lt 2 ]; then
    echo "用法:"
    echo "  获取想法的一级评论: $0 pin <pin_id> [page_num] [page_size]"
    echo "  获取评论的二级评论: $0 comment <root_id> [page_num] [page_size]"
    echo ""
    echo "参数说明:"
    echo "  content_type: pin 或 comment"
    echo "  content_token: 想法ID（当 content_type=pin）或一级评论ID（当 content_type=comment）"
    echo "  page_num: 页码，默认 1"
    echo "  page_size: 每页条数，默认 10，最多 50"
    echo ""
    echo "示例:"
    echo "  $0 pin 1992012205256892542"
    echo "  $0 pin 1992012205256892542 2 20"
    echo "  $0 comment 11386670165"
    echo "  $0 comment 11386670165 1 15"
    exit 1
fi

CONTENT_TYPE="$1"
CONTENT_TOKEN="$2"
PAGE_NUM=${3:-1}      # 默认 page_num=1（第1页）
PAGE_SIZE=${4:-10}    # 默认 page_size=10（每页10条）

# 校验 content_type
if [ "$CONTENT_TYPE" != "pin" ] && [ "$CONTENT_TYPE" != "comment" ]; then
    echo "错误: content_type 必须是 'pin' 或 'comment'"
    exit 1
fi

TIMESTAMP=$(date +%s)
LOG_ID="test-${TIMESTAMP}"

# 生成签名
SIGN_STR="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGN=$(echo -n "$SIGN_STR" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

echo "请求参数:"
echo "  CONTENT_TOKEN: ${CONTENT_TOKEN}"
echo "  CONTENT_TYPE: ${CONTENT_TYPE}"
echo "  PAGE_NUM: ${PAGE_NUM}"
echo "  PAGE_SIZE: ${PAGE_SIZE}"
echo ""

# 构建查询参数
QUERY_PARAMS="content_token=${CONTENT_TOKEN}&content_type=${CONTENT_TYPE}&page_num=${PAGE_NUM}&page_size=${PAGE_SIZE}"

# 发送 GET 请求
RESPONSE=$(curl -s "${DOMAIN}/openapi/comment/list?${QUERY_PARAMS}" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Sign: ${SIGN}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Extra-Info: ")

# 格式化输出（如果安装了 jq）
if command -v jq &> /dev/null; then
  echo "$RESPONSE" | jq .
else
  echo "$RESPONSE"
fi
```



### 2. **社区真实讨论：知乎**热榜列表接口

获取热榜列表

**鉴权传参**

• **app\_key**: 传入用户 token

• **app\_secret**: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

• URL: `/openapi/billboard/list` &#x20;

• Method: GET

**请求参数**

**响应数据**

成功响应示例

```json
{
  "status": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "title": "代表建议增设元宵、重阳为法定节假日，推行法定假日「顺延补休」，出于哪些考量？若施行将产生哪些影响？",
        "body": "假日经济快速升温，日益成为拉动国内消费需求的新兴引擎。3月11日，全国人大代表，辽宁大学党委副书记、校长余淼杰接受封面新闻记者专访时表示，建议增设元宵节、重阳节为法定节假日，推动传统节日“场景化消费”。2026年马年春节，被称为“史上最长春节假期”，更充裕的假期不仅拉长了年味的余韵，更点燃了多元化的消费热潮。商务部商务大数据显示，全国重点零售和餐饮企业日均销售额较2025年春节假期增长5.7%。“这一增长态势表明，合理的假期安排能够有效激发消费活力。但从全年视角观察，居民可支配休闲时间仍相对有限且弹性不足，假日经济潜能尚未得到充分释放。”余淼杰说。他建议，增设元宵节、重阳节为法定节假日，通过制度化休假安排，将传统节日由“文化符号”转化为“消费场景”，实现文化弘扬与服务消费增长的良性互动。全国人大代表，辽宁大学党委副书记、校长余淼杰。受访者供图假期调休引发广泛关注可推行法定假日“顺延补休”近年来，文旅消费对节日期间经济运行的拉动作用凸显，余淼杰认为，目前节日调休争议与双休落实不畅问题相互叠加，削弱了假日经济乘数效应。客观上，调休机制在形式上延长了假期长度，但由此带来的连续工作时间问题引发广泛关注和讨论。他建议，推行法定假日“顺延补休”机制，当法定节假日与周末双休日重合时，就近择日安排顺延补休，确保公众实际休假天数不因日历随机排列而缩水。此举旨在消除公众对“假期占用”的心理落差，增强居民对年度假期的可预见性，为远途旅游及文化消费提供更稳定的时间预期。余淼杰还观察到，双休制度在部分行业落实不到位，在生产连续性较强、服务属性较强及互联网属��",
        "link_url": "https://www.zhihu.com/question/2015097023762756959?utm_campaign=listenhub",
        "published_time": 1773216569,
        "published_time_str": "2026-03-11 16:09:29",
        "state": "PUBLISHED",
        "heat_score": 15450000,
        "token": "2015097023762756959",
        "type": "QUESTION",
        "answers": [
          {
            "title": "",
            "body": "这个建议如果能实现，那可真是太棒了。增设元宵、重阳为法定节日，其实很直接的就是两个考量。一个是让大家有时间过节，而且还是中国的传统节日。说白了，就是不想让传统节日不再流于形式，而是让大家都能够真切地感受到节日的氛围。另一个还是老生常谈的话题，就是为了刺激消费。要知道春节之后就是淡季，大家刚过完节消费完，也没有什么长假了。元宵二到三月份可以刺激一波消费，重阳跟国庆挂钩，再拉动一波消费。所以，既为了打工人考虑，也为了促进市场经济的需要。能实现的话，那也是双赢的状态。但最重要的，可能就是公司不太乐意。毕竟多放假就要多给钱，劳动力跟不上，又觉得影响企业的效益，那老板不得气疯了？真要是变成传统的节日，好处就不用多说了。这俩节日的经济价值肯定也不会被挖掘出来，各种传统的灯会，立马就能营业赚钱。而且打工人也开心啊，毕竟是带薪休假的状态，能够更好地放松自己。我觉得这个建议，最绝的地方还是「顺延补休」。这跟现在的调休是有本质区别的，调休就是拆东墙补西墙，把前后的周末凑出来，然后凑成一个长假。让打工人难以接受的就是，放完假以后还得回来补班，精力会完全地被消耗殆尽。但是，顺延补休就不一样了。如果法定假正好撞上周六周日，那就不借了，直接在下周一或者周五补休一天。这样保证了你的假期天数没少，又不用连续上好多天班，假期来得更干脆。其实建议的初衷都是挺好的，但肯定也要损失部分人的利益。关键就看公司愿不愿意，否则执行起来还是很有难度的。",
            "link_url": "https://www.zhihu.com/answer/2015113984852894758?utm_campaign=listenhub",
            "published_time": 1773220613,
            "published_time_str": "2026-03-11 17:16:53",
            "state": "PUBLISHED",
            "heat_score": 0,
            "token": "2015113984852894758",
            "type": "ANSWER",
            "answers": null,
            "interaction_info": {
              "vote_up_count": 227,
              "like_count": 3,
              "comment_count": 26,
              "favorites": 14,
              "pv_count": 29245
            }
          },
          {
            "title": "",
            "body": "建议增设元宵节和重阳节为法定节假日，这个确实是比较接地气的提议，远比其他吸睛的提议有意义多了。个人认为，增加这两个节日为法定节假日，对弘扬传统文化，对文化复兴具备比较重大的意义，但对促进经济特别是旅游经济，效果可能不如想象中那么理想。中国传统的七个节日：春节、元宵节、清明节、端午节、七夕节、中秋节、重阳节；2007年12月7日，国务院通过修订《全国年节及纪念日放假办法》，明确将清明节、端午节、中秋节新增为法定节假日 除春节一直是法定节假日，清明节、端午节、中秋节是2008年才确定为法定节假日的；在此之前，哪怕是三大节日之端午节和中秋节，都需要上班上学，以致大家对这两大节日慢慢的有淡化的趋势。2008年之前，一般都是五一十一各七天假期，增加了清明节、端午节、中秋节后，五一假期就变成了3天或者5天，所以这三个节日并非完整的增加假期。实际上，清明节，无论你是否放假，大家祭祖的需要，都会产生一定的民间活动，无非就是纯周末和三天的区别，所以，清明节设定为法定节日，对经济的影响相对有限。中秋节比较接近十一长假，甚至有时候与十一重合，个人感觉中秋节假期，对经济的影响有限；大家的消费，不一定完全取决于时间，还取决于年度旅游计划金的多寡，没钱了，放假也就是多休息一天而已。端午节反而显得特殊，毕竟到了公历6月份，还是有部分旅行出游需求的。元宵节，如果有民间活动，无论是否放假，都会举办，这点有点类似于清明节；并且元宵节毕竟离春节上班也就一周左右，你说对旅游经济有多大拉动作用，不能说没有，但应该是有限度的。至于重阳节，毕竟离十一长假较近，所以，重阳节跟�",
            "link_url": "https://www.zhihu.com/answer/2015352469807449448?utm_campaign=listenhub",
            "published_time": 1773277472,
            "published_time_str": "2026-03-12 09:04:32",
            "state": "PUBLISHED",
            "heat_score": 0,
            "token": "2015352469807449448",
            "type": "ANSWER",
            "answers": null,
            "interaction_info": {
              "vote_up_count": 585,
              "like_count": 6,
              "comment_count": 148,
              "favorites": 45,
              "pv_count": 85296
            }
          },
          {
            "title": "",
            "body": "七夕和情人节也应该法定，这样结婚率生育率不就都上去了。",
            "link_url": "https://www.zhihu.com/answer/2015354800447954986?utm_campaign=listenhub",
            "published_time": 1773278027,
            "published_time_str": "2026-03-12 09:13:47",
            "state": "PUBLISHED",
            "heat_score": 0,
            "token": "2015354800447954986",
            "type": "ANSWER",
            "answers": null,
            "interaction_info": {
              "vote_up_count": 21,
              "like_count": 1,
              "comment_count": 9,
              "favorites": 1,
              "pv_count": 5015
            }
          },
          {
            "title": "",
            "body": "元宵离春节假期太近了，尤其目前的趋势还是东拼西凑超长春节假。建议增设七夕和重阳节，都不需要拼凑调休，直接放一天就行。七夕拉动消费自不用多说。老龄化社会增设重阳节很有必要。",
            "link_url": "https://www.zhihu.com/answer/2015393890862122010?utm_campaign=listenhub",
            "published_time": 1773287347,
            "published_time_str": "2026-03-12 11:49:07",
            "state": "PUBLISHED",
            "heat_score": 0,
            "token": "2015393890862122010",
            "type": "ANSWER",
            "answers": null,
            "interaction_info": {
              "vote_up_count": 80,
              "like_count": 1,
              "comment_count": 15,
              "favorites": 0,
              "pv_count": 14572
            }
          },
          {
            "title": "",
            "body": "我对增加一些节假日完全赞同，因为非法定节假日的休息日往往都被各企事业单位强制占据了，企业年假强调那么多年，效果也不好。在这种情况下，增加一些法定节日至少能够保证。即使一些企事业单位想让员工加班，至少要支付双倍或三倍工资，而他们从成本考虑可能就不让加班了。所以法定节日的休息一般能够保证。不过余代表的这个建议我认为不是很科学。先看元宵节，就是农历正月十五。这是春节小长假之后刚过一周的时间内，一是对大家休假的边际效用不高，二是对旅游消费也没有多大促进作用。因为除了南方少数地方，大部分地方此时还比较寒冷，尤其是东北、西北和华北地区还是冰天雪地，放这一天假基本也没法出去旅游。再看重阳节，这个群体的关注对象主要是老年人，他们都已经退休了，放不放假对他们没有啥影响。反倒是年轻人不放假，旅游景点不那么拥挤，酒店价格不那么昂贵，对老人出游有好处。对于年轻群体而言，重阳节一般在国庆节过后，有时候离得比较近，就跟元宵节和春节小长假离得比较近类似，重阳节放假的边际效用也不高。而对于老年群体而言，国庆小长假过后的一个小空档，倒是他们出游的好机会。对此，我是有体会的。我自己的课时不是那么多，我在国庆过后一般会安排一次出行，因为这个时候秋高气爽，国庆小长假刚过，正好交通、景点和酒店都不那么拥挤，比较舒适。所以，我觉得元宵节和重阳节设为法定节假日，并不是很科学。当然，如果不考虑旅游啥的，单纯从纪念传统节日的角度看，把这两个节日增设为法定假日当然是好的。如果单纯从增加节日、增加旅游和休息机会的角度，我觉得可以把五一小长假再增加2天。事实上，在清明�",
            "link_url": "https://www.zhihu.com/answer/2015434886459171551?utm_campaign=listenhub",
            "published_time": 1773297121,
            "published_time_str": "2026-03-12 14:32:01",
            "state": "PUBLISHED",
            "heat_score": 0,
            "token": "2015434886459171551",
            "type": "ANSWER",
            "answers": null,
            "interaction_info": {
              "vote_up_count": 0,
              "like_count": 0,
              "comment_count": 0,
              "favorites": 0,
              "pv_count": 39
            }
          }
        ],
        "interaction_info": {
          "vote_up_count": 40,
          "like_count": 0,
          "comment_count": 15,
          "favorites": 0,
          "pv_count": 326938
        }
      }
    ],
    "pagination": {
      "total": 1
    }
  }
}
```

失败响应示例

```json
{
  "status": 1,
  "msg": "failed to get billboard data",
  "data": null
}
```

响应字段说明

list 数组中的对象字段说明

answers 数组中的对象字段说明

interaction\_info 对象中的字段说明

**curl 示例**

```bash
#!/bin/bash
#热榜列表查询脚本
# 用法: ./billboard_list.sh [top_cnt] [publish_in_hours]

set -e

# 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY="" #用户token
APP_SECRET="" #知乎提供

# 检查帮助参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法: $0 [top_cnt] [publish_in_hours]"
    echo ""
    echo "参数:"
    echo "  top_cnt          获取内容数量 (可选，默认50)"
    echo "  publish_in_hours 发布时间范围，单位小时 (可选，默认48)"
    echo ""
    echo "示例:"
    echo "  $0                # 使用默认参数 (top_cnt=50, publish_in_hours=48)"
    echo "  $0 100            # 指定 top_cnt=100, publish_in_hours=48"
    echo "  $0 100 72         # 指定 top_cnt=100, publish_in_hours=72"
    exit 0
fi

# 解析参数（所有参数都是可选的）
TOP_CNT="${1:-50}"
PUBLISH_IN_HOURS="${2:-48}"

# 验证参数是否为有效数字
if [ -n "$1" ] && ! [[ "$1" =~ ^[0-9]+$ ]]; then
    echo "错误: top_cnt 必须是正整数"
    exit 1
fi

if [ -n "$2" ] && ! [[ "$2" =~ ^[0-9]+$ ]]; then
    echo "错误: publish_in_hours 必须是正整数"
    exit 1
fi

# 验证参数范围（可选，根据业务需求调整）
if [ "$TOP_CNT" -le 0 ]; then
    echo "错误: top_cnt 必须大于 0"
    exit 1
fi

if [ "$PUBLISH_IN_HOURS" -le 0 ]; then
    echo "错误: publish_in_hours 必须大于 0"
    exit 1
fi

 # 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

# 生成签名
EXTRA_INFO=""  # extra_info 可以为空
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:${EXTRA_INFO}"
SIGNATURE=$(printf '%s' "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

echo "=== 查询热榜列表 ==="
echo "top_cnt:  $TOP_CNT"
echo "publish_in_hours: $PUBLISH_IN_HOURS"
echo "时间戳: $TIMESTAMP"
echo "日志ID: $LOG_ID"
echo "签名字符串: $SIGN_STRING"
echo "生成的签名: $SIGNATURE"
echo ""

# 发送请求
echo "发送请求..."
RESPONSE=$(curl -s "${DOMAIN}/openapi/billboard/list?top_cnt=${TOP_CNT}&publish_in_hours=${PUBLISH_IN_HOURS}" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Extra-Info: ${EXTRA_INFO}" \
  -H "X-Sign: ${SIGNATURE}")

echo "响应:"
echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=2))" 2>/dev/null || echo "$RESPONSE"
```





### 3. **知识检索能力：全网可信搜接口**

**接口说明**

该接口用于全网内容搜索，支持搜索知乎平台的问答、文章等内容。

**限流规则**

* QPS 限制：单用户 1 次/秒

* 总调用量限制：单用户 1000 次

**鉴权传参**

* app\_key: 传入用户 token

* app\_secret: 应用密钥（请妥善保管，不要泄露），传入分配的 app\_secret

**接口信息**

* URL: `/openapi/search/global`

* Method: GET

**请求参数**

Query Parameters

**响应数据**

成功响应示例

```json
{
    "status": 0,
    "msg": "success",
    "data": {
        "has_more": false,
        "items": [
            {
                "title": "ChatGPT现在还值得开会员吗？",
                "content_type": "Answer",
                "content_id": "1903044959663284716",
                "content_text": "首先要澄清一个常见误解：ChatGPT的免费版和付费版使用的是不同模型...",
                "url": "https://www.zhihu.com/answer/1903044959663284716?utm_medium=openapi_platform&utm_source=6d23634e",
                "comment_count": 22,
                "vote_up_count": 18,
                "author_name": "时光纪",
                "author_avatar": "https://picx.zhimg.com/50/v2-84ce3330420f9332a1d69d4cd1f10c2f_l.jpg",
                "author_badge": "",
                "author_badge_text": "",
                "edit_time": 1748355858,
                "comment_info_list": [
                    {
                        "content": "没啥区别，免费也是4o 收费你也是用4o..."
                    }
                ],
                "authority_level": "2"
            }
        ]
    }
}
```

**限流响应示例**

```json
{
    "status": 1,
    "msg": "rate limit exceeded",
    "data": null
}
```

**响应字段说明**

data

items

comment\_info\_list

**curl 示例**

```bash
#!/bin/bash
### 搜索接口调用脚本
### 用法: ./search.sh <query> [count]

set -e

### 配置信息
DOMAIN="https://openapi.zhihu.com"
APP_KEY=""      ### 用户token
APP_SECRET=""   ### 知乎提供

### 检查参数
if [ $### -lt 1 ]; then
    echo "用法: $0 <query> [count]"
    echo ""
    echo "参数:"
    echo "  query    查询关键词 (必填)"
    echo "  count    返回数量，最大20 (可选，默认10)"
    echo ""
    echo "示例:"
    echo "  $0 chatgpt"
    echo "  $0 '人工智能' 20"
    exit 1
fi

QUERY="$1"
COUNT="${2:-10}"

### 生成时间戳和日志ID
TIMESTAMP=$(date +%s)
LOG_ID="log_$(date +%s%N | md5sum | cut -c1-16)"

### 生成签名
SIGN_STRING="app_key:${APP_KEY}|ts:${TIMESTAMP}|logid:${LOG_ID}|extra_info:"
SIGNATURE=$(echo -n "$SIGN_STRING" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

echo "=== 全网搜索 ==="
echo "查询关键词: $QUERY"
echo "返回数量: $COUNT"
echo "时间戳: $TIMESTAMP"
echo "日志ID: $LOG_ID"
echo ""

### URL 编码查询参数
ENCODED_QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")

### 发送请求
echo "发送请求..."
RESPONSE=$(curl -s "${DOMAIN}/openapi/search/global?query=${ENCODED_QUERY}&count=${COUNT}" \
  -H "X-App-Key: ${APP_KEY}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "X-Log-Id: ${LOG_ID}" \
  -H "X-Sign: ${SIGNATURE}" \
  -H "X-Extra-Info: ")

echo "响应:"
echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=2))" 2>/dev/null || echo "$RESPONSE"
```



**错误码说明**

**常见错误**

鉴权失败

```json
{
    "code": 401,
    "error_code": 101,
    "error": "AuthenticationError",
    "message": "Key verification failed"
}
```

参数错误

```json
{
    "status": 1,
    "msg": "query is required",
    "data": null
}
```

限流错误

```json
{
    "status": 1,
    "msg": "rate limit exceeded",
    "data": null
}
```



### 4. **形象表达授权：刘看山** IP 形象



源文件可直接下载（注：仅供本次黑客松活动使用）
