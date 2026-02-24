# Security Guide for PDM Project

## Critical Security Items

### 1. Private Key Management

**CRITICAL**: Never commit private keys to version control!

Current Setup (Development):
- Private keys are stored in `.env` file
- `.gitignore` now excludes all `.env` files

**For Production**:
1. Use hardware wallets or HSM (Hardware Security Module)
2. Use environment variables from secure vault (AWS Secrets Manager, HashiCorp Vault)
3. Rotate keys regularly
4. Use separate keys for each environment (dev, staging, production)

### 2. API Security

#### CORS Configuration
```python
# Current secure configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
```

For production, set:
```
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

#### Rate Limiting
```python
# Current settings
RATE_LIMIT_REQUESTS = 100  # per window
RATE_LIMIT_WINDOW = 60     # seconds
```

Adjust based on expected traffic. Consider using Redis for distributed rate limiting.

#### Input Validation
All endpoints now use Pydantic models with:
- Field constraints (min/max length, regex patterns)
- Type validation
- Custom validators

### 3. Smart Contract Security

#### Current Vulnerabilities to Address

1. **Access Control**
   - Add `onlyOwner` or role-based modifiers
   - Implement OpenZeppelin AccessControl

2. **Reentrancy Protection**
   - Use OpenZeppelin ReentrancyGuard
   - Follow Checks-Effects-Interactions pattern

3. **Pausable Functionality**
   - Add emergency pause capability
   - Implement OpenZeppelin Pausable

4. **Input Validation**
   - Validate all function inputs
   - Use SafeMath for arithmetic (or Solidity 0.8+)

#### Recommended Contract Updates

```solidity
// Add to your contracts
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PDMSystem is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ENGINEER_ROLE = keccak256("ENGINEER_ROLE");

    // Use whenNotPaused modifier
    function submitData(...) external whenNotPaused nonReentrant {
        // ...
    }
}
```

### 4. Frontend Security

#### XSS Prevention
- Never use `dangerouslySetInnerHTML` with user input
- Sanitize all displayed data
- Use React's built-in escaping

#### Sensitive Data
- Never store private keys in frontend
- Use secure storage for tokens (httpOnly cookies)
- Clear sensitive data on logout

### 5. Database Security

#### SQL Injection Prevention
- Use parameterized queries (already using SQLite with parameters)
- Never concatenate user input into queries

#### Data Encryption
- Consider encrypting sensitive fields
- Use TLS for database connections

### 6. Deployment Security

#### Environment Variables
1. Never commit `.env` files
2. Use `.env.example` as template
3. Validate all required variables at startup

#### Network Security
- Use HTTPS in production
- Implement proper firewall rules
- Use VPN for database access

### 7. Monitoring & Logging

#### Production Logging
```python
# Use structured logging
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

#### Error Tracking
Consider integrating:
- Sentry for error tracking
- Prometheus/Grafana for metrics
- ELK stack for log aggregation

### 8. Security Checklist

Before deploying to production:

- [ ] Rotate all private keys from development
- [ ] Update CORS_ORIGINS to production domain
- [ ] Enable HTTPS
- [ ] Set up proper rate limiting
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Run security scan (npm audit, pip-audit)
- [ ] Perform contract audit
- [ ] Set up monitoring alerts
- [ ] Create incident response plan
- [ ] Document all API endpoints
- [ ] Test error handling

### 9. Dependency Security

#### Regular Updates
```bash
# Check for vulnerabilities
npm audit
pip-audit

# Update dependencies
npm update
pip install --upgrade -r requirements.txt
```

#### Known Issues
- OpenZeppelin v4.9.6 has known vulnerabilities
- Upgrade to v5.x when compatible

### 10. Incident Response

If a security breach occurs:

1. **Immediately**:
   - Pause contracts if possible
   - Disable compromised endpoints
   - Rotate exposed keys

2. **Investigate**:
   - Check logs for unauthorized access
   - Identify scope of breach
   - Document timeline

3. **Remediate**:
   - Fix vulnerabilities
   - Deploy patches
   - Notify affected users

4. **Post-Incident**:
   - Conduct post-mortem
   - Update security measures
   - Document lessons learned

## Contact

For security concerns, contact the development team immediately.
