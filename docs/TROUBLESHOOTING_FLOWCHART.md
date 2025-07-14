# TwipClip Troubleshooting Flowchart

## Quick Visual Troubleshooting Guide

### Authentication Issues

```mermaid
graph TD
    A[Authentication Error] --> B{What's the error?}
    B -->|"Not a bot" error| C[Cookie Issue]
    B -->|"Not authenticated"| D[No cookies uploaded]
    B -->|"Access denied"| E[Expired cookies]
    
    C --> F[Re-export cookies from browser]
    D --> G[Upload cookie file]
    E --> F
    
    F --> H[Sign into YouTube first]
    H --> I[Export with extension]
    I --> J[Upload to TwipClip]
    
    G --> J
    J --> K[Verify green status]
    K --> L[Test with example]
```

### Processing Issues

```mermaid
graph TD
    A[Processing Problem] --> B{What stage?}
    B -->|Stuck at 0%| C[Thread Analysis Issue]
    B -->|Stuck at 40-60%| D[Download Issue]
    B -->|Stuck at 85%+| E[Frontend Sync Issue]
    B -->|Failed completely| F[Critical Error]
    
    C --> G[Check thread format]
    G --> H[Use URL or plain text]
    
    D --> I[Check authentication]
    I --> J[Verify internet connection]
    
    E --> K[Wait 30 seconds]
    K --> L[Refresh page]
    
    F --> M[Check browser console]
    M --> N[Re-authenticate]
```

### Download Issues

```mermaid
graph TD
    A[Download Problem] --> B{Single or bulk?}
    B -->|Single clip| C[Individual Download Issue]
    B -->|All clips| D[Bulk Download Issue]
    
    C --> E{What happens?}
    E -->|Nothing| F[Check popup blocker]
    E -->|Error| G[Check video availability]
    
    D --> H{What happens?}
    H -->|Timeout| I[Too many clips]
    H -->|Empty ZIP| J[Processing failed]
    
    F --> K[Allow popups for site]
    G --> L[Try different video]
    
    I --> M[Download individually]
    J --> N[Reprocess thread]
```

### Cookie Upload Issues

```mermaid
graph TD
    A[Cookie Upload Failed] --> B{What's the issue?}
    B -->|File not accepted| C[Wrong format]
    B -->|Still shows unauthenticated| D[Invalid cookies]
    B -->|Upload succeeds but fails later| E[Cookie quality issue]
    
    C --> F[Check file format]
    F --> G[Must be Netscape format]
    G --> H[Use cookie extension]
    
    D --> I[Verify YouTube login]
    I --> J[Check all required cookies present]
    
    E --> K[Use fresh browser session]
    K --> L[Export immediately after login]
    L --> M[Don't use incognito for YouTube login]
```

## Common Solutions Reference

### 🔑 Authentication Solutions
1. **Always sign into YouTube first**
2. **Export cookies immediately after login**
3. **Use recommended browser extensions**
4. **Re-export daily for best results**

### ⚡ Performance Solutions
1. **Process one thread at a time**
2. **Break long threads into parts**
3. **Avoid peak hours (evenings/weekends)**
4. **Use faster AI models for testing**

### 🛠️ Technical Solutions
1. **Clear browser cache**
2. **Disable ad blockers**
3. **Check console for errors**
4. **Verify all dependencies installed**

### 📱 Browser-Specific Tips

**Chrome/Edge:**
- Use EditThisCookie extension
- Enable third-party cookies
- Disable enhanced tracking protection for YouTube

**Firefox:**
- Use Cookie Quick Manager
- Set privacy to Standard (not Strict)
- Allow YouTube in exceptions

**Safari:**
- Use Develop menu for cookie export
- Disable "Prevent cross-site tracking"
- May need manual cookie formatting

## When All Else Fails

1. **Test with the example button first**
2. **Try a different browser**
3. **Check if YouTube works normally in your browser**
4. **Restart the application**
5. **Check the [debug script](../scripts/debug-cookies.js)**

---

For detailed explanations, see the full [User Guide](../USER_GUIDE.md) 